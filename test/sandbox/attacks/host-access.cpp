#include <unistd.h>

int main() {
  if (access("/var/run/docker.sock", F_OK) == 0) return 1;
  if (access("/host-secret.txt", F_OK) == 0) return 1;
  return 0;
}
