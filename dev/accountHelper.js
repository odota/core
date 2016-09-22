const input = 'areallyreallylongemailaddresss@gmail.com';
const arr = input.split('@');
const user = arr[0];
let count = 0;
const limit = 5000;
permute(user, 1);

function permute(user, n)
{
  if (n >= user.length || (limit && count > limit))
    {
    arr[0] = user;
    console.log(arr.join('@'));
    count += 1;
    return;
  }
  const diff = [user.substr(0, n), user.substr(n)].join('.');
    // don't add a period
  permute(user, n + 1);
    // add a period
  permute(diff, n + 2);
}
