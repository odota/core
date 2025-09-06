// We could make all the fetchers inherit a base class to give them a consistent structure
export abstract class MatchFetcher<T> {
  // Read from the store without fetching
  public abstract getData(matchId: number): Promise<T | null>;
  // Read from the store, fetch it from remote and save if needed
  public abstract getOrFetchData(
    matchId: number,
    extraData?: GcExtraData | ParseExtraData,
  ): Promise<{ data: T | null; error: string | null; skipped?: boolean, retryable?: boolean }>;
  // Repeatedly tries readOrFetchData until we have successful data
  public getOrFetchDataWithRetry = async (
    matchId: number,
    extraData: GcExtraData,
    retryDelay: number,
  ): Promise<{
    data: T | null;
    error: string | null;
  }> => {
    let data: T | null = null;
    let error: string | null = null;
    let tryCount = 1;
    // Try until we either get data or non-retryable error
    while (!data) {
      const resp = await this.getOrFetchData(matchId, extraData);
      data = resp.data;
      error = resp.error;
      if (error && !resp.retryable) {
        break;
      }
      if (!data) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        tryCount += 1;
        console.log('matchId %s, error %s, attempt %s', matchId, error, tryCount);
      }
    }
    return { data, error };
  }
  // Checks to see if the data is available
  public abstract checkAvailable(matchId: number): Promise<boolean>;
  // Each might also have an internal save function that's not in the interface
}
