document.addEventListener("DOMContentLoaded", function() {
    // Function to fetch group names from the database and populate the dropdown
    function fetchGroupNames() {
        fetch('/groups')
            .then(response => response.json())
            .then(groups => {
                const groupSelect = document.getElementById('groupSelect');
                if (groupSelect) {
                    groupSelect.innerHTML = '<option value="">Select Group</option>';
                    groups.forEach(group => {
                        const option = document.createElement('option');
                        option.value = group.group; // Assuming your group objects have a groupName field
                        option.textContent = group.group;
                        groupSelect.appendChild(option);
                    });
                }
            })
            .catch(error => console.error('Error fetching group names:', error));
    }

    // Function to pre-select the group name if provided in URL parameters
    function preSelectGroupName() {
        const urlParams = new URLSearchParams(window.location.search);
        const group = urlParams.get('group');
        if (group) {
            const groupSelect = document.getElementById('groupSelect');
            if (groupSelect) {
                Array.from(groupSelect.options).forEach(option => {
                    if (option.value === group) {
                        option.selected = true;
                    }
                });
            }
        }
    }

    // Initialize the fetch for group names and try to pre-select a group if applicable
    fetchGroupNames();

    // Modal Trigger and Handling Code
    var modal = document.getElementById("createGroupModal");
    var btn = document.getElementById("createGroupLink");
    var span = document.getElementsByClassName("close")[0];

    btn.onclick = function() {
        modal.style.display = "block";
    }

    span.onclick = function() {
        modal.style.display = "none";
    }

    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    // Handle the creation of a new group via the modal
    document.getElementById("submitNewGroup").addEventListener("click", function() {
        var email = document.getElementById('groupEmail').value;
        var group = document.getElementById("newGroup").value;
        var groupPassword = document.getElementById("newGroupPassword").value;

        fetch('/create-group', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, group, groupPassword }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast("Group created successfully!");
                modal.style.display = "none";
                const groupSelect = document.getElementById('groupSelect');
                const option = new Option(group, group, true, true);
                groupSelect.add(option);
                groupSelect.value = group; // Automatically select the newly created group
            } else {
                showToast("Failed to create group.");
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast('An error occurred while creating the group.');
        });
    });

    // Existing event listener for group selection changes (e.g., show/hide group password input)
    // Add your code here if you need to handle group selection changes

    // Form submission logic for registering a user
    const form = document.querySelector('form');
    form.addEventListener('submit', function(event) {
        event.preventDefault();

        const username = document.querySelector('input[name="username"]').value;
        const password = document.querySelector('input[name="password"]').value;
        const group = document.querySelector('select[name="group"]').value;
        const groupPasswordInput = form.querySelector('input[name="groupPassword"]');
        const groupPassword = groupPasswordInput ? groupPasswordInput.value : '';

        const payload = {
            username,
            password,
            group,
            groupPassword,
        };

        fetch('/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = '/login';
            } else {
                alert(data.message || 'Registration failed. Please try again.');
            }
        })
        .catch(error => {
            console.error('Registration error:', error);
            alert('An error occurred during registration. Please try again.');
        });
    });

    // Function to show toast messages
    function showToast(message) {
      var toast = document.getElementById("toast");
      if (!toast) {
          console.error('Toast element not found');
          return;
      }
      toast.textContent = message;
      toast.style.display = "block"; // Make the toast visible

      // Hide the toast after 3 seconds
      setTimeout(function() {
          toast.style.display = "none";
      }, 3000);
  }
});
