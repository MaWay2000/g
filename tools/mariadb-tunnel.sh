#!/bin/sh
# Open a loopback-only SSH tunnel to a MariaDB server.
# No database password is read or stored by this script.

set -eu

usage() {
    printf '%s\n' \
        'Usage:' \
        '  mariadb-tunnel.sh SSH_TARGET [LOCAL_PORT [REMOTE_HOST [REMOTE_PORT]]]' \
        '' \
        'Arguments:' \
        '  SSH_TARGET   SSH alias or user@server (required)' \
        '  LOCAL_PORT   Local loopback port (default: 3307)' \
        '  REMOTE_HOST  MariaDB host as seen by the SSH server (default: 127.0.0.1)' \
        '  REMOTE_PORT  MariaDB port on the server (default: 3306)' \
        '' \
        'Example:' \
        '  ./tools/mariadb-tunnel.sh maria@game-server.example 3307' \
        '' \
        'Then connect in another terminal:' \
        '  mariadb --protocol=tcp -h 127.0.0.1 -P 3307 -u game_analyzer -p game_database' \
        '' \
        'Stop the tunnel with Ctrl+C.'
}

validate_port() {
    label=$1
    value=$2
    case "$value" in
        ''|*[!0-9]*)
            echo "error: $label must be a number from 1 to 65535" >&2
            exit 2
            ;;
    esac
    if [ "$value" -lt 1 ] || [ "$value" -gt 65535 ]; then
        echo "error: $label must be a number from 1 to 65535" >&2
        exit 2
    fi
}

if [ "$#" -lt 1 ] || [ "$#" -gt 4 ]; then
    usage >&2
    exit 2
fi

if ! command -v ssh >/dev/null 2>&1; then
    echo "error: OpenSSH client 'ssh' was not found" >&2
    exit 127
fi

ssh_target=$1
local_port=${2:-3307}
remote_host=${3:-127.0.0.1}
remote_port=${4:-3306}

validate_port "LOCAL_PORT" "$local_port"
validate_port "REMOTE_PORT" "$remote_port"

echo "Opening local 127.0.0.1:$local_port -> $remote_host:$remote_port through $ssh_target"
echo "The tunnel remains active until you press Ctrl+C."

exec ssh \
    -N \
    -T \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -L "127.0.0.1:${local_port}:${remote_host}:${remote_port}" \
    "$ssh_target"
