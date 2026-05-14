package com.example.chatterserver.mapper.typehandler;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

// sqlite存储的timestamp类型是text, 在这里手动转换
public class LocalDateTimeTypeHandler extends BaseTypeHandler<LocalDateTime> {
  private static final DateTimeFormatter[] FORMATTERS    = {
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS"),
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"), DateTimeFormatter.ISO_LOCAL_DATE_TIME };
  private static final DateTimeFormatter   ISO_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

  @Override
  public void setNonNullParameter(PreparedStatement ps, int i, LocalDateTime parameter,
      JdbcType jdbcType) throws SQLException {
    if (parameter != null) {
      ps.setString(i, parameter.format(FORMATTERS[0]));
    } else {
      ps.setString(i, null);
    }
  }

  @Override
  public LocalDateTime getNullableResult(ResultSet rs, String columnName) throws SQLException {
    String value = rs.getString(columnName);
    return parseLocalDateTime(value);
  }

  @Override
  public LocalDateTime getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
    String value = rs.getString(columnIndex);
    return parseLocalDateTime(value);
  }

  @Override
  public LocalDateTime getNullableResult(CallableStatement cs, int columnIndex)
      throws SQLException {
    String value = cs.getString(columnIndex);
    return parseLocalDateTime(value);
  }

  private LocalDateTime parseLocalDateTime(String value) {
    if (value == null || value.isEmpty()) {
      return null;
    }

    DateTimeParseException lastException = null;
    for (DateTimeFormatter formatter : FORMATTERS) {
      try {
        return LocalDateTime.parse(value, formatter);
      } catch (DateTimeParseException e) {
        lastException = e;
      }
    }

    throw new IllegalArgumentException("Cannot parse date: " + value, lastException);
  }
}