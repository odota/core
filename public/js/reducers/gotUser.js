import { userActions } from '../actions';

const initialState = {
  loading: true,
  error: false
};

export default (state = initialState, action) => {
  switch(action.type) {
    case userActions.REQUEST:
      return {
        ...state,
        loading: true
      };
    case userActions.OK:
      return {
        ...state,
        loading: false,
        user: actions.payload.user
      };
    case userActions.ERROR:
      return {
        ...state,
        loading: false,
        error: true
      };
    default:
      return state;
  }
};
