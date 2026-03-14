const fs = require("fs");
const path = require("path");

const outputPath = path.resolve(__dirname, "..", "models", "storage-box.glb");

const bodyColor = [17 / 255, 24 / 255, 39 / 255, 1];
const accentColor = [34 / 255, 211 / 255, 238 / 255, 1];
const bodyEmissive = [15 / 255, 23 / 255, 42 / 255];
const accentEmissive = [14 / 255, 165 / 255, 233 / 255];

const positions = new Float32Array([
  -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
  -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
  0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5,
  -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
  -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
]);

const normals = new Float32Array([
  0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
  -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
  0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
]);

const indices = new Uint16Array([
  0, 1, 2, 0, 2, 3,
  4, 5, 6, 4, 6, 7,
  8, 9, 10, 8, 10, 11,
  12, 13, 14, 12, 14, 15,
  16, 17, 18, 16, 18, 19,
  20, 21, 22, 20, 22, 23,
]);

function padBuffer(buffer, alignment) {
  const remainder = buffer.length % alignment;
  if (remainder === 0) {
    return buffer;
  }

  return Buffer.concat([buffer, Buffer.alloc(alignment - remainder)]);
}

function writeGlb(json, binaryChunk) {
  const jsonBuffer = padBuffer(Buffer.from(JSON.stringify(json), "utf8"), 4);
  for (let index = jsonBuffer.length - 1; index >= 0; index -= 1) {
    if (jsonBuffer[index] !== 0) {
      continue;
    }

    jsonBuffer[index] = 0x20;
  }

  const binaryBuffer = padBuffer(binaryChunk, 4);
  const totalLength =
    12 +
    8 +
    jsonBuffer.length +
    8 +
    binaryBuffer.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryBuffer.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([
    header,
    jsonHeader,
    jsonBuffer,
    binaryHeader,
    binaryBuffer,
  ]);
}

const positionBuffer = Buffer.from(positions.buffer);
const normalBuffer = Buffer.from(normals.buffer);
const indexBuffer = Buffer.from(indices.buffer);

const positionOffset = 0;
const normalOffset = positionOffset + positionBuffer.length;
const indexOffset = normalOffset + normalBuffer.length;

const binaryChunk = Buffer.concat([positionBuffer, normalBuffer, indexBuffer]);

const gltf = {
  asset: {
    version: "2.0",
    generator: "generate-storage-box-glb.js",
  },
  scene: 0,
  scenes: [
    {
      name: "StorageBoxScene",
      nodes: [0],
    },
  ],
  nodes: [
    {
      name: "StorageBox",
      children: [1, 2, 3, 4],
    },
    {
      name: "Body",
      mesh: 0,
      translation: [0, 0.28, 0],
      scale: [0.94, 0.56, 0.56],
    },
    {
      name: "Lid",
      mesh: 0,
      translation: [0, 0.6, 0],
      scale: [0.98, 0.08, 0.62],
    },
    {
      name: "Trim",
      mesh: 1,
      translation: [0, 0.6, -0.3],
      scale: [0.86, 0.04, 0.06],
    },
    {
      name: "Indicator",
      mesh: 1,
      translation: [0, 0.34, -0.3],
      scale: [0.18, 0.14, 0.04],
    },
  ],
  meshes: [
    {
      name: "StorageBoxBodyMesh",
      primitives: [
        {
          attributes: {
            POSITION: 0,
            NORMAL: 1,
          },
          indices: 2,
          material: 0,
        },
      ],
    },
    {
      name: "StorageBoxAccentMesh",
      primitives: [
        {
          attributes: {
            POSITION: 0,
            NORMAL: 1,
          },
          indices: 2,
          material: 1,
        },
      ],
    },
  ],
  materials: [
    {
      name: "StorageBoxBody",
      pbrMetallicRoughness: {
        baseColorFactor: bodyColor,
        metallicFactor: 0.38,
        roughnessFactor: 0.58,
      },
      emissiveFactor: bodyEmissive,
    },
    {
      name: "StorageBoxAccent",
      pbrMetallicRoughness: {
        baseColorFactor: accentColor,
        metallicFactor: 0.42,
        roughnessFactor: 0.25,
      },
      emissiveFactor: accentEmissive,
    },
  ],
  accessors: [
    {
      name: "CubePositions",
      bufferView: 0,
      componentType: 5126,
      count: 24,
      type: "VEC3",
      min: [-0.5, -0.5, -0.5],
      max: [0.5, 0.5, 0.5],
    },
    {
      name: "CubeNormals",
      bufferView: 1,
      componentType: 5126,
      count: 24,
      type: "VEC3",
    },
    {
      name: "CubeIndices",
      bufferView: 2,
      componentType: 5123,
      count: 36,
      type: "SCALAR",
      min: [0],
      max: [23],
    },
  ],
  bufferViews: [
    {
      buffer: 0,
      byteOffset: positionOffset,
      byteLength: positionBuffer.length,
      target: 34962,
    },
    {
      buffer: 0,
      byteOffset: normalOffset,
      byteLength: normalBuffer.length,
      target: 34962,
    },
    {
      buffer: 0,
      byteOffset: indexOffset,
      byteLength: indexBuffer.length,
      target: 34963,
    },
  ],
  buffers: [
    {
      byteLength: binaryChunk.length,
    },
  ],
};

const glb = writeGlb(gltf, binaryChunk);
fs.writeFileSync(outputPath, glb);

const header = glb.subarray(0, 12);
const magic = header.readUInt32LE(0);
const version = header.readUInt32LE(4);
const length = header.readUInt32LE(8);

if (magic !== 0x46546c67 || version !== 2 || length !== glb.length) {
  throw new Error("Generated GLB header validation failed.");
}

console.log(`Wrote ${path.relative(process.cwd(), outputPath)} (${glb.length} bytes)`);
