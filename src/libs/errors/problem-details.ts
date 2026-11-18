import { ParseError, ValidationError } from "elysia";
import { AppError } from "./app-error";

type ErrorSet = {
  status?: number | string;
  headers: Record<string, string | number | string[]>;
};

const titleFor = (status: number) => {
  switch (status) {
    case 400:
      return "Invalid request";
    case 401:
      return "Authentication required";
    case 403:
      return "Forbidden";
    case 404:
      return "Not found";
    case 409:
      return "Conflict";
    case 422:
      return "Unprocessable request";
    case 413:
      return "Payload too large";
    case 503:
      return "Service unavailable";
    default:
      return "Internal error";
  }
};

export function mapApiError(error: unknown, set: ErrorSet) {
  let status = 500;
  let detail = "The request could not be completed.";

  if (error instanceof AppError) {
    status = error.status;
    detail = error.message;
  } else if (error instanceof ValidationError || error instanceof ParseError) {
    status = 400;
    detail = "The request is invalid.";
  }

  const slug =
    error instanceof AppError && error.problemType
      ? error.problemType
      : status === 400
        ? "validation"
        : status === 401
          ? "authentication-required"
          : status === 403
            ? "forbidden"
            : status === 404
              ? "not-found"
              : status === 409
                ? "conflict"
                : status === 413
                  ? "payload-too-large"
                  : status === 422
                    ? "unprocessable"
                    : status === 503
                      ? "unavailable"
                      : "internal";

  set.status = status;
  set.headers["content-type"] = "application/problem+json";
  if (status === 401) set.headers["www-authenticate"] = "Bearer";

  return {
    type: `https://leetkob.example/problems/${slug}`,
    title: titleFor(status),
    status,
    detail,
  };
}
