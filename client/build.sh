#!/bin/bash

# 1. 清理并创建构建目录
rm -rf build
mkdir build
cd build

# 2. 运行 CMake (不需要指定Generator或编译器, 它会自动找到 Arch 上的 Qt6 和 GCC/Clang)
# CMAKE_EXPORT_COMPILE_COMMANDS=ON 是为了让 clangd 能找到编译信息
cmake .. -DCMAKE_EXPORT_COMPILE_COMMANDS=ON -DCMAKE_BUILD_TYPE=Debug

# 3. 编译 (使用 nproc 自动获取CPU核心数)
make -j$(nproc)

# 4. (可选) 运行
./chatter_client