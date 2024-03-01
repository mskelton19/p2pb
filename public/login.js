if (new URLSearchParams(window.location.search).get('loginFailed')) {
    document.getElementById('login-error').style.display = 'block';
}
