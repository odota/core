import gotMetadata from './gotMetadata';
import gotUser from './gotUser';
import { combineReducers } from 'redux';

const REDUCER_KEY = 'yaspReducer';

export { REDUCER_KEY };

export default combineReducers({
  gotMetadata,
  gotUser
});
