import fetch from 'isomorphic-fetch';
export const REQUEST_METADATA = 'REQUEST_METADATA';
export const RECEIVE_METADATA = 'RECEIVE_METADATA';
export const REQUEST_MATCH = 'REQUEST_MATCH';
export const RECEIVE_MATCH = 'RECEIVE_MATCH';
export const REQUEST_PLAYER = 'REQUEST_PLAYER';
export const RECEIVE_PLAYER = 'RECEIVE_PLAYER';
//TODO 
//LIBS to replace with react equivalents if we want to drop jquery
//datatables
//https://github.com/glittershark/reactable
//qtip2
//https://github.com/wwayne/react-tooltip
//select library
//??? not sure yet
//TODO actions to add
//distributions
//picks
//carry (leaderboard?)
//mmstats
//faq
//blog
//search
//status
//benchmarks
//rankings
//TODO examples
//SELECT_MATCH
//REQUEST_MATCH
//RECEIVE_MATCH
//SELECT_PLAYER
//SELECT_PLAYER_OVERVIEW
//SELECT_PLAYER..., one for each since player data is split?
//REQUEST_PLAYER
//RECEIVE_PLAYER
//SELECT_DISTRIBUTIONS
//SELECT_PICKS
//SELECT_CARRY
export function requestMetadata()
{
  return {
    type: REQUEST_METADATA
  };
}
export function receiveMetadata(json)
{
  return {
    type: RECEIVE_METADATA,
    data: json
  };
}
export function fetchMetadata()
{
  return function(dispatch)
  {
    // First dispatch: the app state is updated to inform
    // that the API call is starting.
    dispatch(requestMetadata());
    // The function called by the thunk middleware can return a value,
    // that is passed on as the return value of the dispatch method.
    // In this case, we return a promise to wait for.
    // This is not required by thunk middleware, but it is convenient for us.
    return fetch(`/api/metadata`).then(response => response.json()).then(json =>
      // We can dispatch many times!
      // Here, we update the app state with the results of the API call.
      dispatch(receiveMetadata(json)));
    // In a real world app, you also want to
    // catch any error in the network call.
  };
}
export function requestMatch()
{
  return {
    type: REQUEST_MATCH
  };
}
export function receiveMatch(json)
{
  return {
    type: RECEIVE_MATCH,
    data: json
  };
}
export function fetchMatch(match_id)
{
  return function(dispatch)
  {
    dispatch(requestMatch());
    return fetch(`/api/matches/` + match_id).then(response => response.json()).then(json => dispatch(receiveMatch(json)));
  };
}