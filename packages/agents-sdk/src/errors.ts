export class AgentClientError extends Error {
  readonly statusCode?: number;
  readonly causeStatus?: number;

  constructor(
    message: string,
    options?: { statusCode?: number; causeStatus?: number },
  ) {
    super(message);
    this.name = "AgentClientError";
    this.statusCode = options?.statusCode;
    this.causeStatus = options?.causeStatus;
  }
}
