-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS users (
    user_id     BIGSERIAL PRIMARY KEY,
    username    VARCHAR(50)  UNIQUE NOT NULL,
    password    VARCHAR(255) NOT NULL,               -- bcrypt hash
    nickname    VARCHAR(50)  NOT NULL DEFAULT '',
    avatar_url  VARCHAR(255) NOT NULL DEFAULT 'https://secure.gravatar.com/avatar/default?s=200&d=mp',
    status      SMALLINT     NOT NULL DEFAULT 0,     -- 0=offline 1=online 2=busy
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS groups (
    group_id    BIGSERIAL PRIMARY KEY,
    group_name  VARCHAR(50)  NOT NULL,
    creator_id  BIGINT       NOT NULL REFERENCES users(user_id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
    group_id    BIGINT NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL REFERENCES users(user_id),
    role        SMALLINT NOT NULL DEFAULT 0,         -- 0=member 1=admin 2=owner
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    message_id   BIGSERIAL PRIMARY KEY,
    sender_id    BIGINT NOT NULL REFERENCES users(user_id),
    receiver_id  BIGINT REFERENCES users(user_id),  -- 私聊，NULL 表示非私聊
    group_id     BIGINT REFERENCES groups(group_id), -- 群聊，NULL 表示非群聊
    message_type SMALLINT NOT NULL DEFAULT 0,        -- 0=text 1=file 2=image 3=system
    content      TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS files (
    file_id          BIGSERIAL PRIMARY KEY,
    message_id       BIGINT NOT NULL REFERENCES messages(message_id),
    file_name        VARCHAR(255) NOT NULL,
    stored_file_name VARCHAR(255) NOT NULL UNIQUE,
    file_url         VARCHAR(255) NOT NULL,
    file_size        BIGINT NOT NULL,
    file_type        VARCHAR(50),
    md5              VARCHAR(32),
    upload_time      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_group    ON messages(group_id);
CREATE INDEX IF NOT EXISTS idx_messages_created  ON messages(created_at);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS group_members;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS users;
-- +goose StatementEnd
