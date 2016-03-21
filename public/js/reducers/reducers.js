import * as Actions from '../actions/actions.js';

export default (state, action) => {
  switch(action.type) {
    case Actions.REQUEST_NAVBAR:
      //TODO load spinner?
      return;
    case Actions.RECEIVE_NAVBAR:
      return Object.assign({}, state, {navbar: action.data});
    default:
      //unrecognized action, return original state
      return state;
  }
};