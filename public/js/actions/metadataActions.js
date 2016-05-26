import fetch from 'isomorphic-fetch';

const url = '/api/metadata';

const REQUEST = 'yasp/metadata/REQUEST';
const OK = 'yasp/metadata/OK';
const ERROR = 'yasp/metadata/ERROR';

export const metadataActions = {
  REQUEST,
  OK,
  ERROR
};

const getMetadataRequest = () => ({ type: REQUST });

const getMetadataOk = (payload) => ({
  type: OK,
  payload
})

const getMetadataError = (payload) => ({
  type: ERROR,
  payload
});

export const getMetadata = (userId) => {
  return (dispatch) => {
    return fetch(url)
      .then(response => response.json())
      .then(json => dispatch(getMetadataOk(json)))
      .catch(error => dispatch(getMetadataError()));
  };
};
