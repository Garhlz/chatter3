# Chatter 聊天服务器
[English Version](#chatter-chat-server)
## 项目概述
Chatter 是一个使用 Java 17 构建的聊天服务器，基于 Spring Boot + MyBatis + 原生 TCP Socket 技术栈，采用 SQLite 数据库存储、JSON 进行通信，并通过 Spring Boot HTTP 服务支持文件传输。系统模块化设计，支持灵活扩展的消息处理机制。  
[客户端](https://github.com/Garhlz/chatter2_client)

## 技术栈
- 开发语言：Java 17
- 框架：Spring Boot 3.1.5
- 数据库：SQLite 3.42.0
- ORM 框架：MyBatis 3.0.2
- 通信协议：原生 Java Socket
- 数据格式：JSON
- 身份验证：JWT
- 连接池：HikariCP

## 当前实现功能
### 核心功能
- [x] 用户认证
  - 登录/注册
  - JWT 令牌验证
  - 会话管理
- [x] 聊天大厅
  - 公共聊天大厅（消息广播）
  - 历史消息记录
  - 服务器消息同步
- [x] 私聊功能
  - 用户在线状态
  - 私聊会话管理
  - 历史消息记录
  - 服务器消息
- [x] 群聊功能
  - 群组创建与解散
  - 群成员管理
- [x] 文件传输
  - 通过 Spring Boot HTTP 实现上传 / 下载
  - 支持传输进度展示
  - 历史文件访问
### 数据库设计
- 用户管理（users表）
- 消息记录（messages表）
- 文件管理（files表）
- 好友关系（friendships表）
- 群组管理（groups表）
- 群组成员（group_members表）

## 项目结构
server/
├── src/main/java/com/example/chatterserver/  
│   ├── config/       # 配置类  
│   ├── controller/   # 控制器   
│   ├── dto/          # 数据传输对象  
│   ├── exception/    # 异常处理  
│   ├── mapper/       # MyBatis映射器  
│   ├── model/        # 数据模型  
│   ├── service/      # 业务逻辑  
│   ├── socket/       # Socket通信  
│   └── util/         # 工具类  
└── src/main/resources/  
├── mapper/       # MyBatis映射文件  
├── schema.sql    # 数据库架构  
└── application.yml # 应用配置    


## 配置说明
- 服务器端口：8080（HTTP）/ 9999（Socket）
- 数据库：本地SQLite文件（chatter.db）
- 连接池：最大连接10，最小空闲5
- JWT令牌：24小时有效期
- 心跳检测：30秒间隔，90秒超时


## 注意事项
- 项目使用 Maven 进行依赖管理
- 运行需要 JDK 17 或更高版本
- 首次运行会自动创建数据库结构


# Chatter Chat Server
[中文版](#Chatter-聊天服务器)
## Overview
Chatter is a chat server developed in Java 17, built with Spring Boot, MyBatis, and native TCP Sockets. It uses SQLite for data persistence, JSON for message exchange, and Spring Boot HTTP server for file transfer. The project is modular and supports extensible message handling mechanisms.  
[client](https://github.com/Garhlz/chatter2_client)
## Tech Stack
- Language: Java 17

- Framework: Spring Boot 3.1.5

- Database: SQLite 3.42.0

- ORM: MyBatis 3.0.2

- Communication: Java Socket

- Data Format: JSON

- Authentication: JWT

- Connection Pool: HikariCP

## Features
### Core Features
- [x] User Authentication

  - Login / Registration

  - JWT token verification

  - Session management

- [x] Public Chatroom

  - Broadcast messages

  - Message history

  - Server-side synchronization

- [x] Private Messaging

  - Online user status

  - Private session management

  - Message history

- [x] Group Chat

  - Group creation and deletion

  - Member management

- [x] Message Handling

  - Persistent message storage

  - Error handling

- [x] File Transfer

  - File upload/download via Spring Boot HTTP

  - Transfer status and progress display

  - Download historical files

### Database Schema
- Users (users)

- Messages (messages)

- Files (files)

- Friendships (friendships)

- Groups (groups)

- Group Members (group_members)

## Project Structure
server/
├── src/main/java/com/example/chatterserver/  
│   ├── config/         # Configuration   
│   ├── controller/     # REST Controllers  
│   ├── dto/            # Data Transfer Objects  
│   ├── exception/      # Exception handling  
│   ├── mapper/         # MyBatis Mappers  
│   ├── model/          # Data models  
│   ├── service/        # Service layer  
│   ├── socket/         # Socket communication  
│   └── util/           # Utility classes
├── src/main/resources/
│   ├── mapper/         # MyBatis XML Mappings  
│   ├── schema.sql      # Database schema  
│   └── application.yml # Application config


## Configuration
- HTTP Port: 8080

- Socket Port: 9999

- Database File: chatter.db (SQLite)

- Connection Pool: Max 10 connections, Min idle 5

- JWT Expiration: 24 hours

- Heartbeat Check: Every 30 seconds, timeout after 90 seconds


## Notes
- Built with Maven for dependency management

- Requires JDK 17 or higher

- On first run, the database schema is initialized automatically



