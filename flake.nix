{
  description = "Chatter3 - Go backend with Tauri frontend";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        lib = pkgs.lib;

        backendPackages = with pkgs; [
          go
          sqlc
          goose
          pkg-config
          postgresql
        ];

        frontendPackages = with pkgs; [
          nodejs
          cargo
          rustc
          rustfmt
          clippy
          pkg-config
          openssl
        ] ++ lib.optionals pkgs.stdenv.isLinux (with pkgs; [
          gtk3
          webkitgtk_4_1
          libsoup_3
          glib-networking
          cairo
          pango
          gdk-pixbuf
          atk
          harfbuzz
        ]);

        legacyClientPackages = with pkgs; [
          cmake
          ninja
          gcc
          pkg-config
          qt6.full
        ] ++ lib.optionals pkgs.stdenv.isLinux (with pkgs; [
          libxcb
        ]);

        backendShellHook = ''
          export PGDATA="$(pwd)/.pgdata"
          export PGHOST=localhost
          export PGUSER=postgres
          export PGPORT=5432
          export DATABASE_URL="postgresql://postgres@localhost:5432/chatter3"
          export JWT_SECRET="dev-secret-min-32-bytes-long"
          export UPLOAD_DIR="$(pwd)/.upload"
          export GOCACHE="/tmp/go-build-chatter3"

          mkdir -p "$UPLOAD_DIR"

          echo "Chatter3 backend shell"
          echo "  Go: $(go version)"
          echo "  Database URL: $DATABASE_URL"
        '';

        frontendShellHook = ''
          export CHATTER_HTTP_BASE_URL="http://127.0.0.1:8080"
          export CHATTER_WS_URL="ws://127.0.0.1:8080/api/v2/ws"
          export npm_config_cache="/tmp/npm-cache-chatter3"
          export CARGO_TARGET_DIR="/tmp/chatter3-tauri-target"

          echo "Chatter3 frontend shell"
          echo "  Node: $(node --version)"
          echo "  Cargo: $(cargo --version)"
          echo "  HTTP base: $CHATTER_HTTP_BASE_URL"
          echo "  WS URL: $CHATTER_WS_URL"
        '';

        legacyClientShellHook = ''
          echo "Chatter3 legacy Qt client shell"
          echo "  This shell exists only for old client maintenance."
        '';
      in
      {
        devShells.backend = pkgs.mkShell {
          packages = backendPackages;
          shellHook = backendShellHook;
        };

        devShells.frontend = pkgs.mkShell {
          packages = frontendPackages;
          shellHook = frontendShellHook;
        };

        devShells.full = pkgs.mkShell {
          packages = backendPackages ++ frontendPackages;
          shellHook = backendShellHook + "\n" + frontendShellHook;
        };

        devShells.legacy-client = pkgs.mkShell {
          packages = legacyClientPackages;
          shellHook = legacyClientShellHook;
        };

        devShells.default = pkgs.mkShell {
          packages = backendPackages ++ frontendPackages;
          shellHook = backendShellHook + "\n" + frontendShellHook;
        };
      }
    );
}
