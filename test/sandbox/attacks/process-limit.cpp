#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

int main() {
  std::vector<pid_t> children;
  for (int i = 0; i < 64; ++i) {
    pid_t child = fork();
    if (child == 0) _exit(0);
    if (child < 0) break;
    children.push_back(child);
  }
  for (pid_t child : children) waitpid(child, nullptr, 0);
  return children.size() < 64 ? 0 : 1;
}
