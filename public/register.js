document.addEventListener("DOMContentLoaded", function() {
    // Assuming you have a function to fetch group names from the database
    function fetchGroupNames() {
        // Make an AJAX request or use your backend framework to fetch group names
        // For example, using Fetch API
        fetch('/groups')
            .then(response => response.json())
            .then(groups => {
                const groupSelect = document.getElementById('groupSelect');
                if (groupSelect) { // Check if element exists
                    // Clear existing options
                    groupSelect.innerHTML = '<option value="">Select Group</option>';
                    // Populate dropdown with group names
                    groups.forEach(group => {
                        const option = document.createElement('option');
                        option.value = group.groupName; // Assuming the group ID is stored in '_id' field
                        option.textContent = group.groupName;
                        groupSelect.appendChild(option);
                    });
                } else {
                    console.error('Element with ID "groupSelect" not found.');
                }
            })
            .catch(error => {
                console.error('Error fetching group names:', error);
            });
    }

    // Call the function to fetch and populate group names when the page loads
    fetchGroupNames();

    // Add event listener for group selection changes
    document.getElementById('groupSelect').addEventListener('change', function() {
        const selectedGroup = this.value;
        console.log(selectedGroup);
        const form = this.closest('form'); // Find the closest form ancestor

        // Attempt to find an existing group password input to update its state
        let groupPasswordInput = form.querySelector('input[name="groupPassword"]');

        // If a group is selected and the group password input doesn't exist, create it
        if (selectedGroup && !groupPasswordInput) {
            groupPasswordInput = document.createElement('input');
            groupPasswordInput.type = 'password';
            groupPasswordInput.name = 'groupPassword';
            groupPasswordInput.placeholder = 'Group Password';
            groupPasswordInput.required = true;

            // Optionally, create a label for the new input
            const groupPasswordLabel = document.createElement('label');
            groupPasswordLabel.textContent = 'Group Password:';
            groupPasswordLabel.htmlFor = 'groupPassword';

            // Insert the label and new input before the submit button
            const submitButton = form.querySelector('input[type="submit"]');
            form.insertBefore(groupPasswordLabel, submitButton);
            form.insertBefore(groupPasswordInput, submitButton);
        } else if (!selectedGroup && groupPasswordInput) {
            // If no group is selected and the input exists, remove it
            const groupPasswordLabel = form.querySelector('label[for="groupPassword"]');
            groupPasswordInput.remove();
            groupPasswordLabel.remove();
        }
    });

    // New functionality for form submission
    const form = document.querySelector('form');
    form.addEventListener('submit', function(event) {
        event.preventDefault(); // Prevent the form from submitting normally

        // Prepare the data to be sent to the server
        const username = document.querySelector('input[name="username"]').value;
        const password = document.querySelector('input[name="password"]').value;
        const groupName = document.querySelector('select[name="group"]').value;
        // Ensure to fetch the groupPassword input value, checking if it exists
        const groupPasswordInput = form.querySelector('input[name="groupPassword"]');
        const groupPassword = groupPasswordInput ? groupPasswordInput.value : null;

        // Construct the payload with user and group information
        const payload = {
            username,
            password,
            groupName,
            groupPassword,
        };

        // Make an AJAX call to the server to attempt registration
        fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Handle successful registration (e.g., redirecting to a login page)
                window.location.href = '/login'; // Adjust as needed
            } else {
                // Display an error message for incorrect group password or other errors
                alert(data.message || 'Registration failed. Please try again.');
            }
        })
        .catch(error => {
            console.error('Registration error:', error);
            alert('An error occurred during registration. Please try again.');
        });
    });


});
