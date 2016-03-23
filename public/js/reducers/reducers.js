import * as Actions from '../actions/actions.js';

export default (state, action) => {
  switch(action.type) {
    case Actions.REQUEST_NAVBAR:
      return Object.assign({}, state, {navbar: {isFetching: true, data: []}});
    case Actions.RECEIVE_NAVBAR:
      var arr = Object.keys(action.data).map(function(page){return {path: page, name: action.data[page].name}});
      return Object.assign({}, state, {navbar: {isFetching: false, data: arr}});
    case Actions.REQUEST_CHEESE:
      return Object.assign({}, state, {cheese: {isFetching: true, data: {}}});
    case Actions.RECEIVE_CHEESE:
      return Object.assign({}, state, {cheese: {isFetching: true, data: action.data}});
    case Actions.REQUEST_USER:
      return Object.assign({}, state, {user: {isFetching: true, data: {}}});
    case Actions.RECEIVE_USER:
      return Object.assign({}, state, {user: {isFetching: true, data: action.data}});
    default:
      //unrecognized action, return original state
      return state;
  }
};