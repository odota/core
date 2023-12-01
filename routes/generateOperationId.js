/* This function will create operation IDs in the format:
`get_players_by_account_id` for the path: "/players/{account_id}"
`get_players_by_account_id_select_matches` for the path: "/players/{account_id}/matches". 
*/

function generateOperationId(method, path) {
  // Split the path into segments
  const pathSegments = path.split('/');

  // Remove the first segment if it's empty (because the path starts with a slash)
  if (pathSegments[0] === '') {
    pathSegments.shift();
  }

  // Convert path parameters to the format "by_{parameter}"
  const segmentsWithParametersReplaced = pathSegments.map((segment) =>
    segment.replace(/{(.*?)}/g, 'by_$1')
  );

  // If there are 3 elements in the path, prefix the last one with "select_"
  if (segmentsWithParametersReplaced.length === 3) {
    segmentsWithParametersReplaced[2] = `select_${segmentsWithParametersReplaced[2]}`;
  }

  // Join all segments with underscores
  const pathWithUnderscores = segmentsWithParametersReplaced.join('_');

  // Convert camelCase to snake_case
  const snakeCaseBase = pathWithUnderscores
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase();

  // Return the method and the path joined with underscores
  return `${method}_${snakeCaseBase}`;
}

module.exports = generateOperationId;
