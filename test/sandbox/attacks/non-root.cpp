#include <unistd.h>

int main() { return geteuid() == 0 ? 1 : 0; }
