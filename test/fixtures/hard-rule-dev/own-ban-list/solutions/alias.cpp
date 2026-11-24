#include <algorithm>
#include <iostream>
namespace helper = std;
int main() {
  int a[2]; std::cin >> a[0] >> a[1];
  helper::stable_sort(a, a + 2);
  std::cout << a[0] << ' ' << a[1];
}
