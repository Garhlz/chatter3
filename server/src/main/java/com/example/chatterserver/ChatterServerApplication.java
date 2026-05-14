package com.example.chatterserver;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.mybatis.spring.annotation.MapperScan;

@SpringBootApplication
@MapperScan("com.example.chatterserver.mapper")
public class ChatterServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(ChatterServerApplication.class, args);
    }
}