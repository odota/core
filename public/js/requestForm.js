window.requestForm = function requestForm()
{
    document.getElementById("match_id").value = window.location.hash.slice(1);
    $("#file-select").on('change', function()
    {
        var label = $(this).val().replace(/\\/g, '/').replace(/.*\//, '');
        $("#file-select-text").text(label);
        $("#file-select-button").toggleClass('btn-success');
    });
}
window.requestSubmit = function submit(response)
{
    var checker;
    var grecaptcha = grecaptcha;
    $("#request").hide('slow');
    $("#messages").empty();
    $("#progContainer").show('slow');
    $("#loading").css("display", "block");
    var match_id = document.getElementById("match_id").value;
    var fileSelect = document.getElementById('file-select');
    // Get the selected files from the input.
    var file = fileSelect.files[0];
    console.log(file);
    // Create a new FormData object.
    var formData = new FormData();
    if (file)
    {
        formData.append('replay_blob', file, file.name);
    }
    else if (match_id)
    {
        formData.append('match_id', match_id);
    }
    formData.append('response', response);
    console.log(formData);
    // Set up the request.
    var xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", updateProgress);
    // Open the connection.
    xhr.open('POST', '/api/request_job', true);
    // Set up a handler for when the request finishes.
    xhr.onload = function()
    {
        var msg = JSON.parse(xhr.responseText);
        if (msg.error)
        {
            showError(msg.error);
        }
        else
        {
            checker = setInterval(function()
            {
                poll(msg.job.jobId);
            }, 2000);
        }
    };
    xhr.onerror = function(){
        submit();
    };
    // Send the Data.
    xhr.send(formData);
    //xhr.send(file);
    function updateProgress(oEvent)
    {
        if (oEvent.lengthComputable)
        {
            var percentComplete = oEvent.loaded / oEvent.total;
            console.log(percentComplete);
            var prog = percentComplete * 100;
            document.getElementById("upload-bar").style.width = prog + "%";
            document.getElementById("upload-bar").innerHTML = prog.toFixed(2) + "% uploaded";
        }
    }

    function showError(data)
    {
        $("#messages").append("<div class='alert alert-danger' role='alert'>" + data + "</div>");
        $("#progContainer").hide('slow');
        $("#request").show('slow');
        console.log("clearing interval %s", checker);
        clearInterval(checker);
        grecaptcha.reset();
    }

    function poll(job_id)
    {
        $.ajax(
        {
            url: "/api/request_job?id=" + job_id
        }).done(function(msg)
        {
            console.log(msg);
            if (msg.state === "completed")
            {
                window.location.assign("/matches/" + (msg.data.payload.replay_blob_key || msg.data.payload.match_id));
            }
            else if (msg.error)
            {
                showError(msg.error);
            }
            else if (msg.state === "failed")
            {
                showError("Failed to parse replay.  Please make sure the replay is available in client and has not expired.");
            }
            else if (msg.progress)
            {
                var prog = msg.progress;
                console.log(prog);
                document.getElementById("parse-bar").style.width = prog + "%";
                document.getElementById("parse-bar").innerHTML = prog.toFixed(2) + "% parsed";
            }
        });
    }
}