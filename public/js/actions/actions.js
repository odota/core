export const REQUEST_NAVBAR = 'GET_NAVBAR';
export function requestNavbar() {
  return {
    type: REQUEST_NAVBAR
  };
}

export const RECEIVE_NAVBAR = 'RECEIVE_NAVBAR';
export function receiveNavbar() {
  return {
    type: RECEIVE_NAVBAR
  };
}

//SELECT_MATCH_OVERVIEW
//SELECT_PLAYER_OVERVIEW
//SELECT_DISTRIBUTIONS
//SELECT_PICKS
//SELECT_CARRY