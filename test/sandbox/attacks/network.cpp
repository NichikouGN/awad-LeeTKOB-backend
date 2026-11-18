#include <arpa/inet.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

int main() {
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) return 0;
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(53);
  inet_pton(AF_INET, "1.1.1.1", &addr.sin_addr);
  int connected = connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr));
  if (connected == 0) {
    close(fd);
    return 1;
  }
  pollfd wait{fd, POLLOUT, 0};
  poll(&wait, 1, 500);
  int error = 0;
  socklen_t size = sizeof(error);
  getsockopt(fd, SOL_SOCKET, SO_ERROR, &error, &size);
  close(fd);
  return error == 0 ? 1 : 0;
}
