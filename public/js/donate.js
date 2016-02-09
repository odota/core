var $cancelInfo = $("#cancel-info");
var $amount = $("#amount");
var $alert = $("#alert");

$('#subscription').change(function() {
    if (this.checked) {
        $cancelInfo.show();
    }
    else {
        $cancelInfo.hide();
    }
});

var handler = StripeCheckout.configure({
    key: stripe_public,
    image: '/public/images/android-chrome-192x192.png',
    locale: 'auto',
    token: function(token) {
        var data = {
            amount: $amount.find(":selected").text(),
            subscription: document.getElementById("subscription").checked,
            token: token
        };

        $.post("/stripe_checkout", data, function(data) {
            if (data == "OK") window.location = "/thanks";
            else {
                $alert.text(data);
                $alert.show();
            }
        });
    }
});

$(document).ready(function() {
    $.get("/brain_tree_client_token", function(token) {
        braintree.setup(token, "custom", {
            paypal: {
                container: "paypal-container"
            },
            onPaymentMethodReceived: function(obj) {
                var data = {
                    amount: $amount.find(":selected").text(),
                    subscription: document.getElementById("subscription").checked,
                    nonce: obj.nonce
                }

                $.post("/brain_tree_checkout", data, function(data) {
                    if (data == "OK") window.location = "/thanks";
                    else {
                        $alert.text(data);
                        $alert.show();
                    }
                });
            }
        });
    })
})

$('#thething').on('click', function(e) {
    // Open Checkout with further options
    handler.open({
        name: 'yasp.co',
        description: $amount.find(":selected").text() + " cheese!",
        amount: $amount.find(":selected").text() * 100,
        bitcoin: true,
        alipay: true
    });
    e.preventDefault();
});

// Close Checkout on page navigation
$(window).on('popstate', function() {
    handler.close();
});