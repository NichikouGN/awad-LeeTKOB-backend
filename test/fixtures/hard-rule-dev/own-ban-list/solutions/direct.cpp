#include <algorithm>
#include <iostream>
int main() {
  int a[2]; std::cin >> a[0] >> a[1];
  std::sort(a, a + 2);
  std::cout << a[0] << ' ' << a[1];
}
