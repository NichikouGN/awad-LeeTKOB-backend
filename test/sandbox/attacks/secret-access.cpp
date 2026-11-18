#include <cstdlib>
#include <unistd.h>

int main() {
  if (std::getenv("MODEL_API_KEY")) return 1;
  if (access("/run/secrets/model_api_key", F_OK) == 0) return 1;
  if (access("/model-key", F_OK) == 0) return 1;
  return 0;
}
