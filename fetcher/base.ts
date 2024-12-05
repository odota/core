// We could make all the fetcher inherit a base class to give them a consistent structure
abstract class BaseFetcher<T> {
    // Read from the store directly
    public abstract readData(): T
    // Read from the store, fetch it from remote if needed
    public abstract getOrFetchData(): T
    // Checks to see if the data is available
    public abstract checkAvailable(): boolean
    // Each might also have an internal save function that's not in the interface
}