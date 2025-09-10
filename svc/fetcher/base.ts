import { redisCount } from '../util/utility.ts';

export abstract class MatchFetcher<T> {
  // Name of the counter to increment when we find saved data when getOrFetching
  public savedDataMetricName: MetricName | undefined;
  // Whether to use saved data already in store when getOrFetching. Default to false to always fetch fresh data
  public useSavedData = false;
  // Read from the store without fetching
  public abstract getData(matchId: number): Promise<T | null>;
  // Read from the store, fetch it from remote and save if needed
  public async getOrFetchData(
    matchId: number,
    extraData?: GcExtraData | ParseExtraData | ApiExtraData,
  ): Promise<{
    data: T | null;
    error: string | null;
    skipped?: boolean;
    retryable?: boolean;
  }> {
    if (!matchId || !Number.isInteger(matchId) || matchId <= 0) {
      return {
        data: null,
        error: '[APIDATA]: invalid match_id',
        skipped: true,
      };
    }
    let saved = await this.getData(matchId);
    if (saved) {
      if (this.savedDataMetricName) {
        redisCount(this.savedDataMetricName);
      }
      if (this.useSavedData) {
        return { data: saved, error: null, skipped: true };
      }
    }
    const result = await this.fetchData(matchId, extraData);
    return result;
  }
  // Repeatedly tries until we have successful data
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
        console.log(
          'matchId %s, error %s, attempt %s',
          matchId,
          error,
          tryCount,
        );
      }
    }
    return { data, error };
  };
  // Fetches the data from the remote store
  public abstract fetchData(
    matchId: number,
    extraData?: GcExtraData | ParseExtraData | ApiExtraData,
  ): Promise<{
    data: T | null;
    error: string | null;
    skipped?: boolean;
    retryable?: boolean;
  }>;
  // Checks to see if the data is available
  public abstract checkAvailable(matchId: number): Promise<boolean>;
  // Each might also have an internal save function that's not in the interface
}
