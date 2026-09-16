// ===================================================================
// Firebase 프로젝트 설정
// Firebase 콘솔 > 프로젝트 설정 > 일반 > "내 앱"에서 복사한 값을 아래에 붙여넣으세요.
// (SETUP.md 1~3단계 참고)
// ===================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAMvc0otI_y7hxeosItu4ATrj18JLjs8rM",
  authDomain: "contract-23088.firebaseapp.com",
  projectId: "contract-23088",
  storageBucket: "contract-23088.firebasestorage.app",
  messagingSenderId: "769748928275",
  appId: "1:769748928275:web:b04b18c59e7700ee96fce6",
};

// Firebase 초기화 (모든 페이지에서 공통으로 사용)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
