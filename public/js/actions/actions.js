import fetch from 'isomorphic-fetch';
export const METADATA = 'METADATA';
export const MATCH = 'MATCH';
export const PLAYER = 'PLAYER';
export function getEndpoint(name, options)
{
  switch (name)
  {
    case METADATA:
      return '/api/metadata';
    case MATCH:
      return '/api/matches/' + options.match_id;
    case PLAYER:
      return '/api/players/' + options.account_id;
    default:
      return null;
  }
}
//TODO 
//LIBS to replace with react equivalents if we want to drop jquery
//datatables
//https://github.com/glittershark/reactable
//qtip2
//https://github.com/wwayne/react-tooltip
//select library
//??? not sure yet
//TODO more actions
//REQUEST_PLAYER..., one for each since player data is split?
//RECEIVE_PLAYER
//REQUEST_DISTRIBUTIONS
//REQUEST_PICKS
//REQUEST_CARRY
//mmstats
//faq
//search
//status
//benchmarks
//rankings
export function requestData(name)
{
  return {
    type: name,
  };
}
export function responseData(name, json)
{
  return {
    type: name,
    data: json,
  };
}
export function fetchData(name, options)
{
  return function(dispatch)
  {
    // First dispatch: the app state is updated to inform
    // that the API call is starting.
    dispatch(requestData(name));
    // The function called by the thunk middleware can return a value,
    // that is passed on as the return value of the dispatch method.
    // In this case, we return a promise to wait for.
    // This is not required by thunk middleware, but it is convenient for us.
    return fetch(getEndpoint(name, options)).then(response => response.json()).then(json =>
      // We can dispatch many times!
      // Here, we update the app state with the results of the API call.
      dispatch(responseData(name, json)));
    // In a real world app, you also want to
    // catch any error in the network call.
  };
}
