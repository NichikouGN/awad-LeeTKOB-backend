#include <iostream>
namespace mine {
void sort(int& a, int& b) { if (a > b) { int t = a; a = b; b = t; } }
}
int main() {
  int a, b; std::cin >> a >> b; mine::sort(a, b);
  std::cout << a << ' ' << b;
}
