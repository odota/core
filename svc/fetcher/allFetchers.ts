import { ApiFetcher } from "./ApiFetcher.ts";
import { ArchivedFetcher } from "./ArchivedFetcher.ts";
import { GcdataFetcher } from "./GcdataFetcher.ts";
import { ParsedFetcher } from "./ParsedFetcher.ts";
import { MetaFetcher } from "./MetaFetcher.ts";

export const apiFetcher = new ApiFetcher();
export const gcFetcher = new GcdataFetcher();
export const parsedFetcher = new ParsedFetcher();
export const archivedFetcher = new ArchivedFetcher();
export const metaFetcher = new MetaFetcher();
