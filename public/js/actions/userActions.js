import fetch from 'isomorphic-fetch';

const url = '/api/players';

const REQUEST = 'yasp/user/REQUEST';
const OK = 'yasp/user/OK';
const ERROR = 'yasp/user/ERROR';

export const userActions = {
  REQUEST,
  OK,
  ERROR
};

const getUserRequest = () => ({ type: REQUEST });

const getUserOk = (payload) => ({
  type: OK,
  payload
})

const getUserError = (payload) => ({
  type: ERROR,
  payload
});

export const getUser = (userId) => {
  return (dispatch) => {
    return fetch(`${url}/${userId}`)
      .then(response => response.json())
      .then(json => dispatch(getUserOk(json)))
      .catch(error => dispatch(getUserError()));
  };
};
