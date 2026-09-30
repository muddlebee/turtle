export class LatestRequest {
  private id = 0

  start(): number {
    this.id += 1
    return this.id
  }

  isCurrent(request: number): boolean {
    return request === this.id
  }

  cancel(): void {
    this.id += 1
  }
}
