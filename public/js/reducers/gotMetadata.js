import { metadataActions } from '../actions';

const initialState = {
  loading: true,
  error: false,
  links: []
};

export default (state = initialState, action) => {
  switch(action.type) {
    case metadataActions.REQUEST:
      return {
        ...state,
        loading: true
      };
    case metadataActions.OK:
      return {
        ...state,
        loading: false,
        links: actions.payload.links
      };
    case metadataActions.ERROR:
      return {
        ...state,
        loading: false,
        error: true
      };
    default:
      return state;
  }
};
