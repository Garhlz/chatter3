BINARY       ?= chatter-server
BUILD_DIR    ?= ./bin
MODULE       := github.com/elaine/chatter2/backend-go

.PHONY: build run tidy migrate-up migrate-down sqlc-gen lint clean

build:
	go build -o $(BUILD_DIR)/$(BINARY) ./cmd/server

run:
	go run ./cmd/server

tidy:
	go mod tidy

# goose 需要安装：go install github.com/pressly/goose/v3/cmd/goose@latest
migrate-up:
	goose -dir migrations postgres "$(DATABASE_URL)" up

migrate-down:
	goose -dir migrations postgres "$(DATABASE_URL)" down

# sqlc 需要安装：go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
sqlc-gen:
	sqlc generate

lint:
	go vet ./...

clean:
	rm -rf $(BUILD_DIR)
