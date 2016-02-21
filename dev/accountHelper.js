var input = "areallyreallylongemailaddresss@gmail.com";
var arr = input.split("@");
var user = arr[0];
var count = 0;
var limit = 5000;
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
    var diff = [user.substr(0, n), user.substr(n)].join('.');
    //don't add a period
    permute(user, n + 1);
    //add a period
    permute(diff, n + 2);
}