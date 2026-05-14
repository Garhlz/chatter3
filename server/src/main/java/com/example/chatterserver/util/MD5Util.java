package com.example.chatterserver.util; // 假设你的工具类包名

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Objects;

/**
 * MD5 工具类。 用于计算文件或字节流的 MD5 摘要，以及进行 MD5 字符串的比较。
 *
 */
public class MD5Util {

    private static final int BUFFER_SIZE = 8192; // 8KB 缓冲区大小

    private MD5Util() {
        // 私有构造函数，防止实例化工具类
    }

    /**
     * 计算指定文件的 MD5 摘要。
     *
     * @param file 要计算 MD5 的文件。
     * @return 文件的 MD5 摘要（32位小写十六进制字符串），如果发生错误则返回 null。
     * @throws IOException 如果文件读取失败。
     * @throws NoSuchAlgorithmException 如果 MD5 算法不可用（极少发生）。
     */
    public static String getFileMd5(File file) throws IOException, NoSuchAlgorithmException {
        // 校验文件是否存在且可读
        Objects.requireNonNull(file, "File cannot be null.");
        if (!file.exists() || !file.isFile()) {
            throw new IOException(
                    "File does not exist or is not a regular file: " + file.getAbsolutePath());
        }
        if (!file.canRead()) {
            throw new IOException("File cannot be read: " + file.getAbsolutePath());
        }

        MessageDigest md = MessageDigest.getInstance("MD5");
        try (InputStream fis = new FileInputStream(file)) {
            byte[] buffer = new byte[BUFFER_SIZE];
            int bytesRead;
            while ((bytesRead = fis.read(buffer)) != -1) {
                md.update(buffer, 0, bytesRead);
            }
        }
        return bytesToHex(md.digest());
    }

    /**
     * 比较两个 MD5 摘要是否一致。
     *
     * @param md5_1 第一个 MD5 字符串。
     * @param md5_2 第二个 MD5 字符串。
     * @return 如果两个 MD5 字符串相同（忽略大小写），则返回 true，否则返回 false。
     */
    public static boolean compareMd5(String md5_1, String md5_2) {
        if (md5_1 == null || md5_2 == null) {
            return Objects.equals(md5_1, md5_2); // 两个都为null时返回true，一个为null一个不为null时返回false
        }
        return md5_1.equalsIgnoreCase(md5_2);
    }

    /**
     * 将字节数组转换为小写十六进制字符串。
     *
     * @param bytes 要转换的字节数组。
     * @return 转换后的十六进制字符串。
     */
    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}