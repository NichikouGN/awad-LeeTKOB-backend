int main() {
  volatile unsigned long long value = 0;
  for (;;) value += 1;
}
