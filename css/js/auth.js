/**
 * auth.js
 * Firebase Authentication 連携
 */

// ログイン状態の監視
auth.onAuthStateChanged(async (user) => {
  const loginPage = document.getElementById('login-page');
  const appContainer = document.getElementById('app-container');

  if (user) {
    console.log("👤 User Logged In:", user.email);
    // ログイン済み：ダッシュボードを表示
    loginPage.style.display = 'none';
    appContainer.style.display = 'block';
    
    // データの読み込み（すでにapp.jsで行っているが、再確認）
    if (!AppState.settings) {
      await loadAllData();
      renderDashboard();
    }
  } else {
    console.log("🚪 User Logged Out");
    // 未ログイン：ログイン画面を表示
    loginPage.style.display = 'flex';
    appContainer.style.display = 'none';
  }
});

// ログイン処理
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    try {
      errorDiv.textContent = '';
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ログイン中...';
      
      await auth.signInWithEmailAndPassword(email, pass);
      
    } catch (error) {
      console.error("Login Error:", error);
      let message = "ログインに失敗しました。";
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        message = "メールアドレスまたはパスワードが正しくありません。";
      } else if (error.code === 'auth/invalid-email') {
        message = "メールアドレスの形式が正しくありません。";
      }
      errorDiv.textContent = message;
      btn.disabled = false;
      btn.innerHTML = 'ログイン';
    }
  });
}

// ログアウト処理
function logout() {
  if (confirm('ログアウトしますか？')) {
    auth.signOut();
  }
}
