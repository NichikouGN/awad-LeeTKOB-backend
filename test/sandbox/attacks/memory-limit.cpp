#include <cstdlib>
#include <cstddef>

int main() {
  constexpr std::size_t bytes = 1024ULL * 1024ULL * 1024ULL;
  volatile unsigned char* memory =
      static_cast<volatile unsigned char*>(std::malloc(bytes));
  if (!memory) return 2;
  unsigned char total = 0;
  for (std::size_t i = 0; i < bytes; i += 4096) {
    memory[i] = static_cast<unsigned char>(i);
    total = static_cast<unsigned char>(total + memory[i]);
  }
  std::free(const_cast<unsigned char*>(memory));
  return total == 255 ? 0 : 0;
}
