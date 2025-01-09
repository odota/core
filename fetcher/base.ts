// We could make all the fetchers inherit a base class to give them a consistent structure
export abstract class MatchFetcher<T> {
  // Read from the store without fetching
  public abstract readData(
    matchId: number,
    noBlobStore: boolean | undefined,
  ): Promise<T | null>;
  // Read from the store, fetch it from remote and save if needed
  public abstract getOrFetchData(
    matchId: number,
    extraData?: GcExtraData | ParseExtraData,
  ): Promise<{ data: T | null; error: string | null; skipped?: boolean }>;
  // Checks to see if the data is available
  public abstract checkAvailable(matchId: number): Promise<boolean>;
  // Each might also have an internal save function that's not in the interface
}
