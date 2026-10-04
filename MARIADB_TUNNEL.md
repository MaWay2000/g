# MariaDB access through an SSH tunnel

This setup gives one external Unix user read-only access without publishing
MariaDB port `3306` to the internet. The database password and SSH private key
must never be committed to this repository.

## 1. Server requirements

The server must have:

- MariaDB running locally;
- SSH access for the external user;
- MariaDB listening on `127.0.0.1:3306` or another private server address;
- no public firewall rule for MariaDB port `3306`.

Check the MariaDB listener on the server:

```sh
sudo ss -ltnp | grep ':3306'
```

The safest expected listener is `127.0.0.1:3306`. Do not change
`bind-address` to `0.0.0.0` for this tunnel.

## 2. Create a read-only MariaDB account

On the server, open the MariaDB administrator console:

```sh
sudo mariadb
```

Run the following SQL after replacing `game_database` and the password. Enter a
new, long random password that is used only by this account:

```sql
CREATE USER 'game_analyzer'@'127.0.0.1'
  IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';

GRANT SELECT, SHOW VIEW ON game_database.*
  TO 'game_analyzer'@'127.0.0.1';

FLUSH PRIVILEGES;
SHOW GRANTS FOR 'game_analyzer'@'127.0.0.1';
```

Do not grant `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`, `FILE`, or global
privileges to a statistics extractor.

## 3. Prepare the Unix client

The client needs OpenSSH and a MariaDB client. Debian/Ubuntu example:

```sh
sudo apt update
sudo apt install openssh-client mariadb-client
```

Make the included helper executable:

```sh
chmod +x tools/mariadb-tunnel.sh
```

SSH keys should be configured normally in `~/.ssh/config` or supplied by the
user's SSH agent. Do not put private-key contents or passwords in this script.

## 4. Open the tunnel

Run this in the first terminal, replacing the SSH account and server:

```sh
./tools/mariadb-tunnel.sh ssh_user@server.example
```

The helper opens only `127.0.0.1:3307` on the client and forwards it to
`127.0.0.1:3306` on the server. It exits if forwarding cannot be established.

If port `3307` is already occupied, choose another local port:

```sh
./tools/mariadb-tunnel.sh ssh_user@server.example 3308
```

## 5. Connect through the tunnel

While the first terminal remains open, use a second terminal:

```sh
mariadb \
  --protocol=tcp \
  --host=127.0.0.1 \
  --port=3307 \
  --user=game_analyzer \
  --password \
  game_database
```

The `--password` option prompts securely. Do not put the password directly on
the command line because it can be recorded in shell history or process lists.

Confirm the account and test read-only access:

```sql
SELECT CURRENT_USER();
SHOW TABLES;
SELECT * FROM one_safe_statistics_table LIMIT 5;
```

## 6. Use from Python

Install the connector in a virtual environment:

```sh
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install mariadb
```

Keep credentials in environment variables or a private secrets manager, not in
source code:

```sh
export GAME_DB_HOST=127.0.0.1
export GAME_DB_PORT=3307
export GAME_DB_NAME=game_database
export GAME_DB_USER=game_analyzer
read -r -s -p 'Database password: ' GAME_DB_PASSWORD
export GAME_DB_PASSWORD
echo
```

The program connects to `127.0.0.1:$GAME_DB_PORT`; SSH encrypts traffic between
the Unix client and the server.

## 7. Stop or revoke access

Press `Ctrl+C` in the tunnel terminal to close the current connection.

To permanently revoke the database account, run on the server:

```sql
DROP USER 'game_analyzer'@'127.0.0.1';
```

Also remove the user's SSH public key from the server if SSH access itself must
be revoked.

## Troubleshooting

- `address already in use`: choose local port `3308` or another unused port.
- `administratively prohibited`: SSH forwarding is disabled by the server's
  `AllowTcpForwarding` policy; an administrator must allow it for this account.
- `access denied`: verify the exact MariaDB account host and password with
  `SHOW GRANTS FOR 'game_analyzer'@'127.0.0.1';`.
- connection timeout: verify SSH access first with `ssh ssh_user@server.example`.
- tunnel opens but MariaDB fails: on the server, test
  `mariadb --protocol=tcp -h 127.0.0.1 -P 3306 -u game_analyzer -p`.
