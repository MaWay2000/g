#!/usr/bin/env python3
"""Inspect an Android APK without installing or executing it.

Usage:
  python3 tools/analyze-game.py /private/path/game.apk
  python3 tools/analyze-game.py https://example.com/game.apk
  python3 tools/analyze-game.py /private/path/game.apk --json

Only the Python standard library is required. If apkanalyzer, aapt/aapt2, or
apksigner is installed, their package/signing details are included as well.
"""

import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import PurePosixPath


MACHINE_NAMES = {
    3: "x86",
    40: "ARM",
    62: "x86-64",
    183: "AArch64",
    243: "RISC-V",
}


def human_bytes(value):
    size = float(value)
    for unit in ("B", "KiB", "MiB", "GiB"):
        if size < 1024.0 or unit == "GiB":
            return "%0.2f %s" % (size, unit)
        size /= 1024.0


def acquire(source):
    parsed = urllib.parse.urlparse(source)
    if parsed.scheme in ("http", "https"):
        handle = tempfile.NamedTemporaryFile(prefix="dusty-nova-analyze-", suffix=".apk", delete=False)
        handle.close()
        request = urllib.request.Request(source, headers={"User-Agent": "DustyNovaAnalyzer/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=60) as response, open(handle.name, "wb") as output:
                shutil.copyfileobj(response, output)
        except Exception:
            try:
                os.unlink(handle.name)
            except OSError:
                pass
            raise
        return handle.name, True

    path = os.path.abspath(os.path.expanduser(source))
    if not os.path.isfile(path):
        raise FileNotFoundError("APK not found: %s" % source)
    return path, False


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest().upper()


def zip_data_offset(stream, info):
    stream.seek(info.header_offset)
    header = stream.read(30)
    if len(header) != 30 or header[:4] != b"PK\x03\x04":
        return None
    name_length, extra_length = struct.unpack_from("<HH", header, 26)
    return info.header_offset + 30 + name_length + extra_length


def elf_stats(payload):
    if len(payload) < 64 or payload[:4] != b"\x7fELF":
        return None
    elf_class = payload[4]
    data_encoding = payload[5]
    if elf_class not in (1, 2) or data_encoding not in (1, 2):
        return None
    endian = "<" if data_encoding == 1 else ">"
    try:
        machine = struct.unpack_from(endian + "H", payload, 18)[0]
        if elf_class == 1:
            phoff = struct.unpack_from(endian + "I", payload, 28)[0]
            phentsize = struct.unpack_from(endian + "H", payload, 42)[0]
            phnum = struct.unpack_from(endian + "H", payload, 44)[0]
            align_offset = 28
            align_format = "I"
        else:
            phoff = struct.unpack_from(endian + "Q", payload, 32)[0]
            phentsize = struct.unpack_from(endian + "H", payload, 54)[0]
            phnum = struct.unpack_from(endian + "H", payload, 56)[0]
            align_offset = 48
            align_format = "Q"

        alignments = []
        for index in range(phnum):
            offset = phoff + index * phentsize
            if offset + phentsize > len(payload) or phentsize < align_offset + struct.calcsize(align_format):
                break
            segment_type = struct.unpack_from(endian + "I", payload, offset)[0]
            if segment_type == 1:
                alignment = struct.unpack_from(endian + align_format, payload, offset + align_offset)[0]
                alignments.append(alignment)
        return {
            "class_bits": 32 if elf_class == 1 else 64,
            "endianness": "little" if data_encoding == 1 else "big",
            "machine": MACHINE_NAMES.get(machine, "machine-%d" % machine),
            "load_alignments": alignments,
            "min_load_alignment": min(alignments) if alignments else None,
            "supports_16k_pages": bool(alignments) and min(alignments) >= 16384,
        }
    except (IndexError, struct.error):
        return None


def run_tool(command):
    try:
        completed = subprocess.run(command, check=False, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return None
    output = (completed.stdout or "") + (completed.stderr or "")
    return {"exit_code": completed.returncode, "output": output.strip()}


def android_metadata(path):
    result = {"tool": None, "raw": None}
    apkanalyzer = shutil.which("apkanalyzer")
    if apkanalyzer:
        fields = {}
        commands = {
            "application_id": [apkanalyzer, "manifest", "application-id", path],
            "version_name": [apkanalyzer, "manifest", "version-name", path],
            "version_code": [apkanalyzer, "manifest", "version-code", path],
            "min_sdk": [apkanalyzer, "manifest", "min-sdk", path],
            "target_sdk": [apkanalyzer, "manifest", "target-sdk", path],
            "permissions": [apkanalyzer, "manifest", "permissions", path],
        }
        for name, command in commands.items():
            response = run_tool(command)
            if response and response["exit_code"] == 0:
                text = response["output"]
                fields[name] = text.splitlines() if name == "permissions" else text
        result.update({"tool": "apkanalyzer", "fields": fields})
        return result

    aapt = shutil.which("aapt2") or shutil.which("aapt")
    if aapt:
        response = run_tool([aapt, "dump", "badging", path])
        result.update({"tool": os.path.basename(aapt), "raw": response})
    return result


def signing_metadata(path, zip_names):
    certificates = sorted(
        name for name in zip_names
        if name.upper().startswith("META-INF/") and name.upper().endswith((".RSA", ".DSA", ".EC"))
    )
    result = {"v1_certificate_entries": certificates, "apksigner": None}
    apksigner = shutil.which("apksigner")
    if apksigner:
        result["apksigner"] = run_tool([apksigner, "verify", "--verbose", "--print-certs", path])
    return result


def analyze(path, source, verify_zip=False, top_count=12):
    result = {
        "source": source,
        "local_path": path,
        "size_bytes": os.path.getsize(path),
        "sha256": sha256_file(path),
    }
    extension_stats = defaultdict(lambda: {"files": 0, "bytes": 0})
    native_libraries = []

    with zipfile.ZipFile(path) as archive, open(path, "rb") as raw_stream:
        infos = [item for item in archive.infolist() if not item.is_dir()]
        total_uncompressed = sum(item.file_size for item in infos)
        total_compressed = sum(item.compress_size for item in infos)
        for item in infos:
            extension = PurePosixPath(item.filename).suffix.lower() or "[none]"
            extension_stats[extension]["files"] += 1
            extension_stats[extension]["bytes"] += item.file_size
            parts = item.filename.split("/")
            if len(parts) == 3 and parts[0] == "lib" and item.filename.endswith(".so"):
                offset = zip_data_offset(raw_stream, item)
                payload = archive.read(item)
                native_libraries.append({
                    "path": item.filename,
                    "abi": parts[1],
                    "size_bytes": item.file_size,
                    "compressed_bytes": item.compress_size,
                    "compression": "stored" if item.compress_type == zipfile.ZIP_STORED else "compressed",
                    "data_offset": offset,
                    "zip_16k_aligned": offset is not None and offset % 16384 == 0,
                    "elf": elf_stats(payload),
                })

        result["zip"] = {
            "entries": len(infos),
            "uncompressed_bytes": total_uncompressed,
            "compressed_bytes": total_compressed,
            "compression_ratio": (float(total_compressed) / total_uncompressed) if total_uncompressed else 0.0,
            "bad_entry": archive.testzip() if verify_zip else None,
        }
        result["largest_entries"] = [
            {"path": item.filename, "size_bytes": item.file_size, "compressed_bytes": item.compress_size}
            for item in sorted(infos, key=lambda entry: entry.file_size, reverse=True)[:top_count]
        ]
        result["extensions"] = {
            name: extension_stats[name]
            for name in sorted(extension_stats, key=lambda key: extension_stats[key]["bytes"], reverse=True)
        }
        result["native_libraries"] = sorted(native_libraries, key=lambda item: item["path"])
        result["abis"] = sorted({item["abi"] for item in native_libraries})
        result["signing"] = signing_metadata(path, [item.filename for item in infos])

    result["android"] = android_metadata(path)
    stored_libraries = [item for item in native_libraries if item["compression"] == "stored"]
    if native_libraries and len(stored_libraries) == len(native_libraries):
        native_packaging = "direct_from_apk"
    elif native_libraries and not stored_libraries:
        native_packaging = "extract_on_install"
    elif native_libraries:
        native_packaging = "mixed"
    else:
        native_packaging = "none"
    result["native_library_packaging"] = native_packaging
    result["checks"] = {
        "zip_readable": True,
        # Compressed libraries are extracted by Android, so their offsets inside
        # the APK are not page-alignment requirements. Report that case as N/A.
        "stored_native_libs_zip_16k_aligned": (
            all(item["zip_16k_aligned"] for item in stored_libraries) if stored_libraries else None
        ),
        "all_native_libs_elf_16k": bool(native_libraries) and all(
            item["elf"] is not None and item["elf"]["supports_16k_pages"] for item in native_libraries
        ),
    }
    return result


def print_text(result):
    print("Dusty Nova APK analyzer")
    print("Source:       %s" % result["source"])
    print("Local file:   %s" % result["local_path"])
    print("Size:         %s (%d bytes)" % (human_bytes(result["size_bytes"]), result["size_bytes"]))
    print("SHA-256:      %s" % result["sha256"])
    print("ZIP entries:  %d" % result["zip"]["entries"])
    print("Expanded:     %s" % human_bytes(result["zip"]["uncompressed_bytes"]))
    print("Compressed:   %s" % human_bytes(result["zip"]["compressed_bytes"]))
    print("ABIs:         %s" % (", ".join(result["abis"]) if result["abis"] else "none"))
    print("Native libs:  %s" % result["native_library_packaging"])

    print("\nChecks")
    for name, value in result["checks"].items():
        if value is None:
            status = "N/A"
        else:
            status = "PASS" if value else "FAIL/UNAVAILABLE"
        print("  %-40s %s" % (name, status))

    print("\nNative libraries")
    if not result["native_libraries"]:
        print("  none")
    for item in result["native_libraries"]:
        elf = item["elf"] or {}
        print(
            "  %s | %s | %s | ZIP offset %s (%s) | ELF min align %s (%s)"
            % (
                item["path"],
                human_bytes(item["size_bytes"]),
                item["compression"],
                item["data_offset"],
                (
                    "16K OK" if item["zip_16k_aligned"] else "not 16K"
                ) if item["compression"] == "stored" else "N/A (extracted)",
                elf.get("min_load_alignment", "unknown"),
                "16K OK" if elf.get("supports_16k_pages") else "not 16K/unknown",
            )
        )

    print("\nLargest APK entries")
    for item in result["largest_entries"]:
        print("  %-64s %10s" % (item["path"], human_bytes(item["size_bytes"])))

    print("\nContent by extension")
    for extension, stats in list(result["extensions"].items())[:15]:
        print("  %-12s %6d files %12s" % (extension, stats["files"], human_bytes(stats["bytes"])))

    android = result["android"]
    print("\nAndroid package metadata")
    if android.get("fields"):
        for name, value in android["fields"].items():
            if isinstance(value, list):
                print("  %s:" % name)
                for line in value:
                    print("    %s" % line)
            else:
                print("  %-16s %s" % (name, value))
    elif android.get("raw"):
        print(android["raw"].get("output") or "  metadata command produced no output")
    else:
        print("  Install Android SDK apkanalyzer or aapt/aapt2 for decoded manifest fields.")

    signing = result["signing"]
    print("\nSigning")
    if signing["apksigner"]:
        print(signing["apksigner"].get("output") or "  apksigner produced no output")
    else:
        print("  Install Android SDK apksigner for v2/v3 certificate verification.")
        print("  v1 certificate entries: %s" % (", ".join(signing["v1_certificate_entries"]) or "none"))


def main():
    parser = argparse.ArgumentParser(description="Extract static statistics from an Android APK without executing it.")
    parser.add_argument("apk", help="Local APK path or HTTP(S) URL")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    parser.add_argument("--verify-zip", action="store_true", help="Read every ZIP member and report CRC failures")
    parser.add_argument("--top", type=int, default=12, help="Number of largest entries to report (default: 12)")
    args = parser.parse_args()

    path = None
    temporary = False
    try:
        path, temporary = acquire(args.apk)
        result = analyze(path, args.apk, verify_zip=args.verify_zip, top_count=max(1, min(args.top, 100)))
        if args.json:
            print(json.dumps(result, indent=2, sort_keys=True))
        else:
            print_text(result)
        return 0
    except (OSError, ValueError, zipfile.BadZipFile, urllib.error.URLError) as error:
        print("error: %s" % error, file=sys.stderr)
        return 2
    finally:
        if temporary and path:
            try:
                os.unlink(path)
            except OSError:
                pass


if __name__ == "__main__":
    sys.exit(main())
