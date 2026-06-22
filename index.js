import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  runTransaction,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCm_0NlWGzuzpOjY2bDreyQCcfwA-1y5Vw",
  authDomain: "festival-b86ed.firebaseapp.com",
  projectId: "festival-b86ed",
  storageBucket: "festival-b86ed.firebasestorage.app",
  messagingSenderId: "894749507915",
  appId: "1:894749507915:web:ec6cad2bc47131358d68ce",
  measurementId: "G-SS7Y58CG6L"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// DOM Elements
const tabOrder = document.getElementById("tab-order");
const tabWaiting = document.getElementById("tab-waiting");
const viewOrder = document.getElementById("view-order");
const viewWaiting = document.getElementById("view-waiting");
const orderForm = document.getElementById("order-form");
const completeScreen = document.getElementById("complete-screen");
const ticketResult = document.getElementById("ticket-result");
const btnNextOrder = document.getElementById("btn-next-order");
const waitingList = document.getElementById("waiting-list");
const loading = document.getElementById("loading");

const nameInput = document.getElementById("name");
const locationInput = document.getElementById("location");
const quantityInput = document.getElementById("quantity");
const nameError = document.getElementById("name-error");
const quantityError = document.getElementById("quantity-error");

// ログイン画面のDOM要素
const loginScreen = document.getElementById("login-screen");
const mainApp = document.getElementById("main-app");
const visitorPasswordInput = document.getElementById("visitor-password");
const visitorPasswordError = document.getElementById("visitor-password-error");
const btnVisitorLogin = document.getElementById("btn-visitor-login");

// ログイン処理
btnVisitorLogin.addEventListener("click", async () => {
  if (visitorPasswordInput.value === "テスト") {
    loading.classList.remove("hidden");
    visitorPasswordError.style.display = "none";
    try {
      // 匿名ログインを実行（Firestoreルール request.auth != null を満たすため）
      await signInAnonymously(auth);
      
      loginScreen.classList.add("hidden");
      mainApp.classList.remove("hidden");
      // ログイン状態をセッションに保存（リロード時のため）
      sessionStorage.setItem("isVisitorLoggedIn", "true");
    } catch (authError) {
      console.error("Auth error: ", authError);
      alert("認証の接続に失敗しました。FirebaseのAuthenticationで「匿名 (Anonymous) 認証」が有効になっているかご確認ください。");
    } finally {
      loading.classList.add("hidden");
    }
  } else {
    visitorPasswordError.style.display = "block";
  }
});

// リロード時のログイン状態復元
if (sessionStorage.getItem("isVisitorLoggedIn") === "true") {
  loading.classList.remove("hidden");
  signInAnonymously(auth).then(() => {
    loginScreen.classList.add("hidden");
    mainApp.classList.remove("hidden");
  }).catch((error) => {
    console.error("Session restore auth error: ", error);
  }).finally(() => {
    loading.classList.add("hidden");
  });
}

// 自分の注文番号を管理
function getMyTickets() {
  const tickets = localStorage.getItem("myTapiocaTickets");
  return tickets ? JSON.parse(tickets) : [];
}

function addMyTicket(ticketNumber) {
  const tickets = getMyTickets();
  if (!tickets.includes(ticketNumber)) {
    tickets.push(ticketNumber);
    localStorage.setItem("myTapiocaTickets", JSON.stringify(tickets));
  }
}

// タブ切り替え処理
function switchTab(tabName) {
  if (tabName === "order") {
    tabOrder.classList.add("active");
    tabWaiting.classList.remove("active");
    viewOrder.classList.remove("hidden");
    viewWaiting.classList.add("hidden");
  } else {
    tabWaiting.classList.add("active");
    tabOrder.classList.remove("active");
    viewWaiting.classList.remove("hidden");
    viewOrder.classList.add("hidden");
  }
}

tabOrder.addEventListener("click", () => switchTab("order"));
tabWaiting.addEventListener("click", () => switchTab("waiting"));

// 注文処理
orderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const name = nameInput.value.trim();
  const location = locationInput.value;
  const quantity = parseInt(quantityInput.value, 10);
  
  let hasError = false;
  if (!name) {
    nameError.style.display = "block";
    hasError = true;
  } else {
    nameError.style.display = "none";
  }
  
  if (isNaN(quantity) || quantity < 1 || quantity > 10) {
    quantityError.style.display = "block";
    hasError = true;
  } else {
    quantityError.style.display = "none";
  }
  
  if (hasError) return;

  loading.classList.remove("hidden");

  try {
    const ordersRef = collection(db, "orders");
    
    // タイムアウト用ヘルパー関数（10秒）
    const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("サーバー通信がタイムアウトしました。通信環境やFirebaseの設定をご確認ください。")), ms));

    let nextTicket = 1;

    // トランザクションによる安全な連番採番と注文登録
    await Promise.race([
      runTransaction(db, async (transaction) => {
        const counterRef = doc(db, "counters", "orders");
        const counterDoc = await transaction.get(counterRef);

        if (counterDoc.exists()) {
          nextTicket = counterDoc.data().lastTicketNumber + 1;
          if (nextTicket > 9999) {
            nextTicket = 1;
          }
        } else {
          nextTicket = 1;
        }

        // カウンターの値を更新
        transaction.set(counterRef, { lastTicketNumber: nextTicket }, { merge: true });

        // 新しい注文ドキュメントの参照を作成し、トランザクション内で書き込みを行う
        const newOrderRef = doc(collection(db, "orders"));
        transaction.set(newOrderRef, {
          ticketNumber: nextTicket,
          name,
          quantity,
          location,
          delivered: false,
          createdAt: serverTimestamp()
        });
      }),
      timeout(10000)
    ]);
    
    // 注文完了表示
    const paddedTicket = String(nextTicket).padStart(4, "0");
    ticketResult.textContent = paddedTicket;
    
    // 自分の注文番号としてローカルストレージに保存
    addMyTicket(nextTicket);
    
    orderForm.classList.add("hidden");
    completeScreen.style.display = "block";
    
    // フォームリセット
    orderForm.reset();
    nameInput.value = "";
    quantityInput.value = "1";
    
  } catch (error) {
    console.error("Error adding document: ", error);
    alert("注文に失敗しました。エラー詳細: " + error.message);
  } finally {
    loading.classList.add("hidden");
  }
});

// 次の注文へ
btnNextOrder.addEventListener("click", () => {
  completeScreen.style.display = "none";
  orderForm.classList.remove("hidden");
});

// 待ち一覧のリアルタイム同期
const waitingQuery = query(
  collection(db, "orders"),
  where("delivered", "==", false)
);

onSnapshot(waitingQuery, (snapshot) => {
  waitingList.innerHTML = "";
  
  if (snapshot.empty) {
    waitingList.innerHTML = "<p style='text-align:center;color:#888;font-size:1.5rem;padding:20px;'>現在待ちのお客様はいません。</p>";
    return;
  }
  
  let orders = [];
  snapshot.forEach((doc) => {
    orders.push(doc.data());
  });
  
  // クライアント側でソート (昇順)
  orders.sort((a, b) => a.ticketNumber - b.ticketNumber);

  const myTickets = getMyTickets();

  orders.forEach((data) => {
    const ticketNumStr = String(data.ticketNumber).padStart(4, "0");
    
    const div = document.createElement("div");
    div.className = "waiting-item";
    
    if (myTickets.includes(data.ticketNumber)) {
      div.classList.add("my-ticket");
      div.innerHTML = `${ticketNumStr} <span class="my-ticket-label">← あなたの注文番号</span>`;
    } else {
      div.textContent = ticketNumStr;
    }
    
    waitingList.appendChild(div);
  });
});

// 背景スライドショーの制御 (15秒ごとにフェード切り替え)
function initBgSlideshow() {
  const slides = document.querySelectorAll(".bg-slide");
  if (slides.length === 0) return;

  let currentSlide = 0;

  setInterval(() => {
    slides[currentSlide].classList.remove("active");
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add("active");
  }, 15000); // 15秒周期
}

initBgSlideshow();
