#include <algorithm>
#include <iostream>
int main() {
  const char* unused = R"(std::sort(a, a + 2);)";
  (void)unused;
  // std::stable_sort is forbidden, but this is only a comment.
  int a, b; std::cin >> a >> b; if (a > b) std::swap(a, b);
  std::cout << a << ' ' << b;
}
