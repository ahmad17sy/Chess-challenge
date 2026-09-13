const board = document.getElementById("chessboard");
const lightColor = document.getElementById("lightColor");
const darkColor = document.getElementById("darkColor");

function updateBoardColors() {

    if (!lightColor || !darkColor) {
        return;
    }

    document.querySelectorAll(".light").forEach(function(square) {
        square.style.backgroundColor = lightColor.value;
    });

    document.querySelectorAll(".dark").forEach(function(square) {
        square.style.backgroundColor = darkColor.value;
    });
}

if (lightColor) {
    lightColor.addEventListener("input", updateBoardColors);
}

if (darkColor) {
    darkColor.addEventListener("input", updateBoardColors);
}
// ===============================
// الوضع الابتدائي
// ===============================

const startingPosition = [
    "bR","bN","bB","bQ","bK","bB","bN","bR",
    "bP","bP","bP","bP","bP","bP","bP","bP",
    "","","","","","","","",
    "","","","","","","","",
    "","","","","","","","",
    "","","","","","","","",
    "wP","wP","wP","wP","wP","wP","wP","wP",
    "wR","wN","wB","wQ","wK","wB","wN","wR"
];

let pieces = [...startingPosition];


let currentTurn = "w";
let gameOver = false;
let selectedSquare = null;
let castlingRights = {
    wK: true,
    wQ: true,
    bK: true,
    bQ: true
};

// ===============================
// ساعة الشطرنج
// ===============================

let whiteTime = 600;
let blackTime = 600;
let incrementTime = 0;
let selectedTime = 600;
let clockInterval = null;
let draggedSquare = null;
let playerColor = "w";
let premove = null;
let computerRating = 2000;
let capturedWhite = [];
let capturedBlack = [];
function getEngineSkill(rating) {
    if (rating <= 1500) return 2;
    if (rating <= 1600) return 4;
    if (rating <= 1700) return 6;
    if (rating <= 1800) return 8;
    if (rating <= 1900) return 10;
    if (rating <= 2000) return 12;
    if (rating <= 2100) return 14;
    if (rating <= 2200) return 16;
    if (rating <= 2300) return 18;
    return 20;
}
let stockfish = new Worker("stockfish-18-lite-single.js");

let stockfishReady = false;
let stockfishThinking = false;
let engineRequestId = 0;
let currentEngineRequest = 0;
let gameSessionId = 0;
let engineRequestSession = 0;
let stockfishEvaluation = 0;
let analysisStockfish = new Worker("stockfish-18-lite-single.js");

let analysisReady = false;
let analysisEvaluation = 0;
let analysisThinking = false;

let pendingMoveAnalysis = null;
let evaluationBeforeMove = 0;
let lastMoveEvaluation = 0;
let moveAnalysis = [];

stockfish.onmessage = function(event) {

    const message = event.data;

    console.log("Stockfish:", message);

    // Stockfish أصبح جاهزًا
    if (message === "uciok") {
        stockfish.postMessage("isready");
        return;
    }

    if (message === "readyok") {
        stockfishReady = true;
        return;
    }

    // تقييم الوضع الحالي
   if (message.startsWith("info") && message.includes("score")) {

    // تقييم بالنقاط
    const cpMatch = message.match(/score cp (-?\d+)/);

    if (cpMatch) {

        let score =
            parseInt(cpMatch[1], 10) / 100;

        if (currentTurn === "b") {
            score = -score;
        }

        stockfishEvaluation = score;
        updateEvaluationBar();

        return;
    }

    // كش مات
    const mateMatch =
        message.match(/score mate (-?\d+)/);

    if (mateMatch) {

        let mate =
            parseInt(mateMatch[1], 10);

        // قيمة كبيرة لتمثيل المات
        let score =
            mate > 0 ? 10 : -10;

        if (currentTurn === "b") {
            score = -score;
        }

        stockfishEvaluation = score;

        updateEvaluationBar();

        return;
    }
}

    // أفضل نقلة
    if (message.startsWith("bestmove")) {

        const requestId = currentEngineRequest;

const parts = message.split(" ");
const move = parts[1];

stockfishThinking = false;

if (
    requestId !== engineRequestId ||
    engineRequestSession !== gameSessionId
) {
    console.log("Old Stockfish move ignored.");
    return;
}

        // لا توجد نقلة
        if (!move || move === "(none)") {
            updateGameStatus();
            return;
        }

        const from = algebraicToIndex(move.substring(0, 2));
        const to = algebraicToIndex(move.substring(2, 4));

        if (gameOver) return;

if (currentTurn === playerColor) return;

if (requestId !== engineRequestId) return;

makeMove(from, to);
    }
};

stockfish.postMessage("uci");
analysisStockfish.onmessage = function(event) {

    const message = event.data;

    if (message === "uciok") {
        analysisStockfish.postMessage("isready");
        return;
    }

    if (message === "readyok") {
        analysisReady = true;

        // تحليل الوضع الابتدائي
        analyzeCurrentPosition();

        return;
    }

    if (
        message.startsWith("info") &&
        message.includes("score cp")
    ) {

        const match =
            message.match(/score cp (-?\d+)/);

        if (!match) return;

        let score =
            parseInt(match[1], 10) / 100;

        // Stockfish يعطي التقييم بالنسبة للاعب صاحب الدور
        const fen = getFEN();
        const sideToMove = fen.split(" ")[1];

        // نحول التقييم دائماً إلى منظور الأبيض
        if (sideToMove === "b") {
            score = -score;
        }

        analysisEvaluation = score;

        return;
    }

    if (message.startsWith("bestmove")) {

        analysisThinking = false;

        if (!pendingMoveAnalysis) {
            return;
        }

        const result = pendingMoveAnalysis;

        pendingMoveAnalysis = null;

        const after = analysisEvaluation;

        let loss;

        // اللاعب الذي قام بالنقلة
        if (result.mover === "w") {
            loss = result.before - after;
        } else {
            loss = after - result.before;
        }

        loss = Math.max(0, loss);

        const classification =
            classifyMoveLoss(loss);

        moveAnalysis.push({
            move: result.move,
            classification: classification,
            loss: loss,
            evaluation: after
        });

        console.log(
            "Move:",
            result.move,
            "|",
            classification,
            "| Loss:",
            loss.toFixed(2)
        );

        updateMoveHistoryAnalysis();
    }
};

analysisStockfish.postMessage("uci");
let history = [];
let moveHistory = [];
let redoHistory = [];
let lastMove = null;
function updateMoveHistory() {

    const movesList =
        document.getElementById("movesList");

    if (!movesList) {
        return;
    }

    movesList.innerHTML = "";

    for (let i = 0; i < moveHistory.length; i += 2) {

        const row =
            document.createElement("div");

        row.className = "move-row";

        // النقلة السوداء
        const black =
            document.createElement("span");

        black.className = "black-move";
        black.textContent =
            moveHistory[i + 1] || "";

        // رقم النقلة
        const number =
            document.createElement("span");

        number.className = "move-number";
        number.textContent =
            (Math.floor(i / 2) + 1) + ".";

        // النقلة البيضاء
        const white =
            document.createElement("span");

        white.className = "white-move";
        white.textContent =
            moveHistory[i] || "";

        row.appendChild(black);
        row.appendChild(number);
        row.appendChild(white);

        movesList.appendChild(row);
    }

    movesList.scrollTop =
        movesList.scrollHeight;

    updateMoveHistoryAnalysis();
}

let enPassantSquare = null;

// ===============================
// الأدوات الأساسية
// ===============================

function getColor(piece) {
    return piece ? piece[0] : null;
}

function getType(piece) {
    return piece ? piece[1] : null;
}

function getPosition(index) {
    return {
        row: Math.floor(index / 8),
        col: index % 8
    };
}

function getIndex(row, col) {
    return row * 8 + col;
}

function isInside(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

// ===============================
// إيجاد الملك
// ===============================

function findKing(color, position = pieces) {

    for (let i = 0; i < 64; i++) {

        if (position[i] === color + "K") {
            return i;
        }
    }

    return -1;
}

// ===============================
// هل مربع معين مهدد؟
// ===============================

function isSquareAttacked(square, byColor, position = pieces) {

    const target = getPosition(square);

    for (let i = 0; i < 64; i++) {

        const piece = position[i];

        if (!piece || getColor(piece) !== byColor) {
            continue;
        }

        const start = getPosition(i);

        const rowDiff = target.row - start.row;
        const colDiff = target.col - start.col;

        const absRow = Math.abs(rowDiff);
        const absCol = Math.abs(colDiff);

        const type = getType(piece);

        // البيدق
        if (type === "P") {

            const direction = byColor === "w" ? -1 : 1;

            if (
                rowDiff === direction &&
                absCol === 1
            ) {
                return true;
            }
        }

        // الحصان
        if (type === "N") {

            if (
                (absRow === 2 && absCol === 1) ||
                (absRow === 1 && absCol === 2)
            ) {
                return true;
            }
        }

        // الملك
        if (type === "K") {

            if (absRow <= 1 && absCol <= 1) {
                return true;
            }
        }

        // الفيل / الوزير
        if (type === "B" || type === "Q") {

            if (absRow === absCol && absRow !== 0) {

                const rowStep = rowDiff > 0 ? 1 : -1;
                const colStep = colDiff > 0 ? 1 : -1;

                let row = start.row + rowStep;
                let col = start.col + colStep;

                let clear = true;

                while (row !== target.row || col !== target.col) {

                    if (position[getIndex(row, col)]) {
                        clear = false;
                        break;
                    }

                    row += rowStep;
                    col += colStep;
                }

                if (clear) {
                    return true;
                }
            }
        }

        // الرخ / الوزير
        if (type === "R" || type === "Q") {

            if (
                (rowDiff === 0 && colDiff !== 0) ||
                (colDiff === 0 && rowDiff !== 0)
            ) {

                const rowStep =
                    rowDiff === 0 ? 0 : rowDiff > 0 ? 1 : -1;

                const colStep =
                    colDiff === 0 ? 0 : colDiff > 0 ? 1 : -1;

                let row = start.row + rowStep;
                let col = start.col + colStep;

                let clear = true;

                while (row !== target.row || col !== target.col) {

                    if (position[getIndex(row, col)]) {
                        clear = false;
                        break;
                    }

                    row += rowStep;
                    col += colStep;
                }

                if (clear) {
                    return true;
                }
            }
        }
    }

    return false;
}

// ===============================
// هل الملك في كش؟
// ===============================

function isInCheck(color, position = pieces) {

    const king = findKing(color, position);

    if (king === -1) {
        return true;
    }

    const enemy = color === "w" ? "b" : "w";

    return isSquareAttacked(king, enemy, position);
}

// ===============================
// حركة القطعة بدون التحقق من الملك
// ===============================

function isPseudoLegalMove(from, to, position = pieces) {

    if (from === to) {
        return false;
    }

    const piece = position[from];
    const target = position[to];

    if (!piece) {
        return false;
    }

    if (target && getColor(target) === getColor(piece)) {
        return false;
    }

    const color = getColor(piece);
    const type = getType(piece);

    const start = getPosition(from);
    const end = getPosition(to);

    const rowDiff = end.row - start.row;
    const colDiff = end.col - start.col;

    const absRow = Math.abs(rowDiff);
    const absCol = Math.abs(colDiff);

    // =========================
    // Pawn
    // =========================

    if (type === "P") {

        const direction = color === "w" ? -1 : 1;
        const startRow = color === "w" ? 6 : 1;

        // خطوة واحدة
        if (
            colDiff === 0 &&
            rowDiff === direction &&
            !target
        ) {
            return true;
        }

        // خطوتان
        if (
            colDiff === 0 &&
            rowDiff === direction * 2 &&
            start.row === startRow &&
            !target
        ) {

            const middle = getIndex(
                start.row + direction,
                start.col
            );

            if (!position[middle]) {
                return true;
            }
        }

        // أخذ قطعة
        if (
            absCol === 1 &&
            rowDiff === direction &&
            target &&
            getColor(target) !== color
        ) {
            return true;
        }

        // En Passant
        if (
            absCol === 1 &&
            rowDiff === direction &&
            to === enPassantSquare
        ) {
            return true;
        }

        return false;
    }

    // =========================
    // Knight
    // =========================

    if (type === "N") {

        return (
            (absRow === 2 && absCol === 1) ||
            (absRow === 1 && absCol === 2)
        );
    }

    // =========================
    // King
    // =========================

    if (type === "K") {

        // الحركة العادية
        if (absRow <= 1 && absCol <= 1) {
            return true;
        }

        // التبييت
        if (rowDiff === 0 && absCol === 2) {

            if (color === "w" && from === 60) {

                // تبييت قصير
                if (
                    to === 62 &&
                    castlingRights.wK &&
                    position[61] === "" &&
                    position[62] === "" &&
                    position[63] === "wR"
                ) {
                    return true;
                }

                // تبييت طويل
                if (
                    to === 58 &&
                    castlingRights.wQ &&
                    position[59] === "" &&
                    position[58] === "" &&
                    position[57] === "" &&
                    position[56] === "wR"
                ) {
                    return true;
                }
            }

            if (color === "b" && from === 4) {

                // تبييت قصير
                if (
                    to === 6 &&
                    castlingRights.bK &&
                    position[5] === "" &&
                    position[6] === "" &&
                    position[7] === "bR"
                ) {
                    return true;
                }

                // تبييت طويل
                if (
                    to === 2 &&
                    castlingRights.bQ &&
                    position[3] === "" &&
                    position[2] === "" &&
                    position[1] === "" &&
                    position[0] === "bR"
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    // =========================
    // Bishop / Rook / Queen
    // =========================

    if (
        type === "B" ||
        type === "R" ||
        type === "Q"
    ) {

        let validDirection = false;

        if (type === "B") {
            validDirection = absRow === absCol && absRow !== 0;
        }

        if (type === "R") {
            validDirection =
                (rowDiff === 0 && colDiff !== 0) ||
                (colDiff === 0 && rowDiff !== 0);
        }

        if (type === "Q") {
            validDirection =
                absRow === absCol && absRow !== 0 ||
                (rowDiff === 0 && colDiff !== 0) ||
                (colDiff === 0 && rowDiff !== 0);
        }

        if (!validDirection) {
            return false;
        }

        const rowStep =
            rowDiff === 0 ? 0 : rowDiff > 0 ? 1 : -1;

        const colStep =
            colDiff === 0 ? 0 : colDiff > 0 ? 1 : -1;

        let row = start.row + rowStep;
        let col = start.col + colStep;

        while (row !== end.row || col !== end.col) {

            if (position[getIndex(row, col)]) {
                return false;
            }

            row += rowStep;
            col += colStep;
        }

        return true;
    }

    return false;
}

// ===============================
// تنفيذ حركة مؤقتة
// ===============================

function simulateMove(from, to, position) {

    const newPosition = [...position];

    const piece = newPosition[from];
    const color = getColor(piece);
    const type = getType(piece);

    // En Passant
    if (
        type === "P" &&
        to === enPassantSquare &&
        !newPosition[to]
    ) {

        const direction = color === "w" ? 1 : -1;

        const capturedPawn = to + direction * 8;

        newPosition[capturedPawn] = "";
    }

    newPosition[to] = piece;
    newPosition[from] = "";

    // تبييت
    if (type === "K" && Math.abs(to - from) === 2) {

        if (to > from) {

            newPosition[from + 3] = "";
            newPosition[from + 1] = color + "R";

        } else {

            newPosition[from - 4] = "";
            newPosition[from - 1] = color + "R";
        }
    }

    return newPosition;
}

// ===============================
// هل الحركة قانونية فعلاً؟
// ===============================

function isLegalMove(from, to) {

    const piece = pieces[from];

    if (!piece) {
        return false;
    }

    if (getColor(piece) !== currentTurn) {
        return false;
    }

    if (!isPseudoLegalMove(from, to, pieces)) {
        return false;
    }

    // التبييت يحتاج التأكد من أن الملك
    // لا يمر عبر كش

    if (
        getType(piece) === "K" &&
        Math.abs(to - from) === 2
    ) {

        if (isInCheck(currentTurn)) {
            return false;
        }

        const direction = to > from ? 1 : -1;

        const middleSquare = from + direction;

        const middlePosition =
            simulateMove(from, middleSquare, pieces);

        const enemy =
            currentTurn === "w" ? "b" : "w";

        if (
            isSquareAttacked(
                middleSquare,
                enemy,
                middlePosition
            )
        ) {
            return false;
        }
    }

    const newPosition =
        simulateMove(from, to, pieces);

    return !isInCheck(currentTurn, newPosition);
}

// ===============================
// تحديث حقوق التبييت
// ===============================

function updateCastlingRights(from, to, piece) {

    // الملك تحرك
    if (piece === "wK") {
        castlingRights.wK = false;
        castlingRights.wQ = false;
    }

    if (piece === "bK") {
        castlingRights.bK = false;
        castlingRights.bQ = false;
    }

    // الرخ تحرك
    if (from === 63 && piece === "wR") {
        castlingRights.wK = false;
    }

    if (from === 56 && piece === "wR") {
        castlingRights.wQ = false;
    }

    if (from === 7 && piece === "bR") {
        castlingRights.bK = false;
    }

    if (from === 0 && piece === "bR") {
        castlingRights.bQ = false;
    }

    // أخذ رخ
    if (to === 63) {
        castlingRights.wK = false;
    }

    if (to === 56) {
        castlingRights.wQ = false;
    }

    if (to === 7) {
        castlingRights.bK = false;
    }

    if (to === 0) {
        castlingRights.bQ = false;
    }
}

// ===============================
// تدوين النقلات SAN
// ===============================

function getMoveNotation(from, to, piece) {

    const type = getType(piece);
    const color = getColor(piece);

    // التبييت
    if (type === "K" && Math.abs(to - from) === 2) {

        if (to > from) {
            return "O-O";
        } else {
            return "O-O-O";
        }
    }

    const toSquare =
        String.fromCharCode(97 + (to % 8)) +
        (8 - Math.floor(to / 8));

    const pieceLetters = {
        K: "K",
        Q: "Q",
        R: "R",
        B: "B",
        N: "N",
        P: ""
    };

    let notation = pieceLetters[type];

    // هل الحركة أخذ قطعة؟
    let isCapture = false;

    if (pieces[to]) {
        isCapture = true;
    }

    // En Passant
    if (
        type === "P" &&
        to === enPassantSquare &&
        !pieces[to]
    ) {
        isCapture = true;
    }

    // البيدق عند الأخذ يحتاج اسم العمود
    if (type === "P" && isCapture) {
        notation +=
            String.fromCharCode(
                97 + (from % 8)
            );
    }

    if (isCapture) {
        notation += "x";
    }

    notation += toSquare;

    return notation;
}

// ===============================
// تنفيذ الحركة
// ===============================
function classifyMoveLoss(loss) {

    if (loss < 0.10) {
        return "Excellent";
    }

    if (loss < 0.30) {
        return "Good";
    }

    if (loss < 0.70) {
        return "Inaccuracy";
    }

    if (loss < 1.50) {
        return "Mistake";
    }

    return "Blunder";
}
function analyzeCurrentPosition() {

    if (!analysisReady) {
        return;
    }

    if (analysisThinking) {
        return;
    }

    analysisThinking = true;

    const fen = getFEN();

    analysisStockfish.postMessage(
        "position fen " + fen
    );

    analysisStockfish.postMessage(
        "go movetime 100"
    );
}
function analyzePlayedMove(moveNotation, moverColor, before) {

    if (!analysisReady) {
        return;
    }

    pendingMoveAnalysis = {
        move: moveNotation,
        mover: moverColor,
        before: before
    };

    analysisThinking = true;

    const fen = getFEN();

    analysisStockfish.postMessage(
        "position fen " + fen
    );

    analysisStockfish.postMessage(
        "go movetime 100"
    );
}


function makeMove(from, to) {

    if (gameOver) {
        return false;
    }

    if (!isLegalMove(from, to)) {
        return false;
    }

    redoHistory = [];

        // اللاعب الذي قام بالنقلة
    const moverColor = currentTurn;

    // تقييم الوضع قبل النقلة
    const evaluationBefore = analysisEvaluation;

    // حفظ الحالة للـ Undo
    history.push({
    pieces: [...pieces],
    currentTurn: currentTurn,
    castlingRights: { ...castlingRights },
    enPassantSquare: enPassantSquare,
    whiteTime: whiteTime,
    blackTime: blackTime,
    capturedWhite: [...capturedWhite],
    capturedBlack: [...capturedBlack]
});

    const piece = pieces[from];
const color = getColor(piece);
const type = getType(piece);

// القطعة التي سيتم أخذها
let capturedPiece = pieces[to];

// En Passant
if (
    type === "P" &&
    to === enPassantSquare &&
    !pieces[to]
) {
    const direction = color === "w" ? 1 : -1;
    capturedPiece = pieces[to + direction * 8];
}

// تسجيل القطعة المأخوذة
if (capturedPiece) {
    if (getColor(capturedPiece) === "w") {
        capturedWhite.push(capturedPiece);
    } else {
        capturedBlack.push(capturedPiece);
    }
}

const moveNotation = getMoveNotation(from, to, piece);

moveHistory.push(moveNotation);

const oldEnPassant = enPassantSquare;

    // En Passant
    if (
        type === "P" &&
        to === oldEnPassant &&
        !pieces[to]
    ) {

        const direction = color === "w" ? 1 : -1;

        pieces[to + direction * 8] = "";
    }

    // تحديث حقوق التبييت
    updateCastlingRights(from, to, piece);

    // تنفيذ الحركة
    pieces[to] = pieces[from];
    pieces[from] = "";

    // التبييت وتحريك الرخ
    if (type === "K" && Math.abs(to - from) === 2) {

        if (to > from) {

            pieces[from + 1] = pieces[from + 3];
            pieces[from + 3] = "";

        } else {

            pieces[from - 1] = pieces[from - 4];
            pieces[from - 4] = "";
        }
    }

    // En Passant جديد
    enPassantSquare = null;

    if (
        type === "P" &&
        Math.abs(to - from) === 16
    ) {

        enPassantSquare =
            (from + to) / 2;
    }

    // ترقية
    if (
        type === "P" &&
        (Math.floor(to / 8) === 0 ||
         Math.floor(to / 8) === 7)
    ) {

        promotePawn(to);
    }

    if (currentTurn === "w") {
    whiteTime += incrementTime;
} else {
    blackTime += incrementTime;
}

currentTurn =
    currentTurn === "w" ? "b" : "w";

updateClocks();

analyzePlayedMove(
    moveNotation,
    moverColor,
    evaluationBefore
);

lastMove = {
    from: from,
    to: to
};

updateMoveHistory();
updateCapturedPieces();

    selectedSquare = null;

    createBoard();

updateGameStatus();

// ===============================
// الكمبيوتر أو Premove
// ===============================

if (currentTurn !== playerColor) {

    computerMove();

} else if (premove) {

    const pendingPremove = premove;

    premove = null;

    if (
        isLegalMove(
            pendingPremove.from,
            pendingPremove.to
        )
    ) {

        makeMove(
            pendingPremove.from,
            pendingPremove.to
        );

    }
}

return true;
}

// ===============================
// ترقية البيدق
// ===============================

function promotePawn(square) {

    const color = getColor(pieces[square]);

    const promotionBox = document.createElement("div");
    promotionBox.className = "promotion-box";

    const title = document.createElement("div");
    title.className = "promotion-title";
    title.textContent = "Choose promotion";

    promotionBox.appendChild(title);

    const piecesToChoose = ["Q", "R", "B", "N"];

    piecesToChoose.forEach(function(type) {

        const button = document.createElement("button");
        button.className = "promotion-piece";

        const image = document.createElement("img");
        image.src = color + type + ".svg";

        button.appendChild(image);

        button.addEventListener("click", function() {

            pieces[square] = color + type;

            promotionBox.remove();

            createBoard();
        });

        promotionBox.appendChild(button);
    });

    document.body.appendChild(promotionBox);
}
// ===============================
// معرفة الحركات القانونية
// ===============================

function getLegalMoves(color) {

    const moves = [];

    for (let from = 0; from < 64; from++) {

        if (!pieces[from]) {
            continue;
        }

        if (getColor(pieces[from]) !== color) {
            continue;
        }

        for (let to = 0; to < 64; to++) {

            if (isLegalMoveForColor(from, to, color)) {
                moves.push({
                    from: from,
                    to: to
                });
            }
        }
    }

    return moves;
}

// نسخة خاصة بفحص الطرف الآخر
function isLegalMoveForColor(from, to, color) {

    const oldTurn = currentTurn;

    currentTurn = color;

    const result = isLegalMove(from, to);

    currentTurn = oldTurn;

    return result;
}

// ===============================
// حالة اللعبة
// ===============================
function updateGameStatus() {

    const status = document.getElementById("gameStatus");

    if (!status) {
        return;
    }

    if (gameOver) {
        status.textContent = "Game Over";
        return;
    }

    const legalMoves = getLegalMoves(currentTurn);
    const inCheck = isInCheck(currentTurn);

    if (legalMoves.length === 0) {

        gameOver = true;
        if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
}

        if (inCheck) {
            const winner =
                currentTurn === "w"
                    ? "Black"
                    : "White";

            status.textContent =
                "Checkmate — " + winner + " wins!";
        } else {
            status.textContent =
                "Draw — Stalemate";
        }

        return;
    }

    if (inCheck) {
        status.textContent =
            currentTurn === playerColor
                ? "Check! Your turn"
                : "Check! Computer's turn";

        return;
    }

    if (currentTurn === playerColor) {

        status.textContent =
            "Your turn";

    } else {

        status.textContent =
            "Computer thinking...";
    }
}

// ===============================
// التراجع Undo
// ===============================
function undoMove() {
    gameSessionId++;
    engineRequestId++;
currentEngineRequest = engineRequestId;
stockfishThinking = false;
stockfish.postMessage("stop");
premove = null;
    if (history.length === 0) {
        return;
    }

    // حفظ الحالة الحالية لكي يستطيع Redo إعادتها
   redoHistory.push({
    pieces: [...pieces],
    currentTurn: currentTurn,
    castlingRights: { ...castlingRights },
    enPassantSquare: enPassantSquare,
    moveHistory: [...moveHistory],
    whiteTime: whiteTime,
    blackTime: blackTime,
    capturedWhite: [...capturedWhite],
    capturedBlack: [...capturedBlack]
});

    if (history.length >= 2) {

        history.pop();

        const previous = history.pop();

        pieces = [...previous.pieces];

        currentTurn = previous.currentTurn;

        castlingRights = {
            ...previous.castlingRights
        };

        enPassantSquare =
            previous.enPassantSquare;
            capturedWhite = [...previous.capturedWhite];
capturedBlack = [...previous.capturedBlack];
            whiteTime = previous.whiteTime;
            blackTime = previous.blackTime;
            updateClocks();

        if (moveHistory.length >= 2) {
            moveHistory.pop();
            moveHistory.pop();
        }

    } else {

        const previous = history.pop();

        pieces = [...previous.pieces];

        currentTurn = previous.currentTurn;

        castlingRights = {
            ...previous.castlingRights
        };

        enPassantSquare =
    previous.enPassantSquare;
    capturedWhite = [...previous.capturedWhite];
capturedBlack = [...previous.capturedBlack];

whiteTime = previous.whiteTime;
blackTime = previous.blackTime;
updateClocks();

if (moveHistory.length > 0) {
    moveHistory.pop();
}
    }

    selectedSquare = null;
    draggedSquare = null;

    createBoard();

    updateMoveHistory();
updateCapturedPieces();

updateGameStatus();
}
function redoMove() {
    gameSessionId++;
engineRequestId++;
currentEngineRequest = engineRequestId;
stockfishThinking = false;
stockfish.postMessage("stop");
premove = null;
    if (redoHistory.length === 0) {
        return;
    }

    const next = redoHistory.pop();

    pieces = [...next.pieces];

    currentTurn = next.currentTurn;

    castlingRights = {
        ...next.castlingRights
    };

    enPassantSquare = next.enPassantSquare;
    capturedWhite = [...next.capturedWhite];
capturedBlack = [...next.capturedBlack];
    whiteTime = next.whiteTime;
    blackTime = next.blackTime;
    updateClocks();

    moveHistory = [...next.moveHistory];

    selectedSquare = null;
    draggedSquare = null;

    createBoard();

    updateMoveHistory();
updateCapturedPieces();
    updateGameStatus();
}

// ===============================
// لعبة جديدة
// ===============================
// ===============================
// حركة الكمبيوتر
// ===============================
function resignGame() {

    if (gameOver) {
        return;
    }

    const winner =
        playerColor === "w"
            ? "Black"
            : "White";

    gameOver = true;

if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
}

currentTurn = null;

    alert(
        "Game over!\n" +
        winner +
        " wins by resignation."
    );
}

function newGame() {
    gameSessionId++;
engineRequestId++;
currentEngineRequest = engineRequestId;
stockfishThinking = false;
stockfish.postMessage("stop");
    const timeSelect = document.getElementById("timeSelect");

    if (timeSelect) {
        const values = timeSelect.value.split(",");

        selectedTime = Number(values[0]);
        incrementTime = Number(values[1]);
    }

    gameOver = false;
    pieces = [...startingPosition];

    currentTurn = "w";

    selectedSquare = null;

    draggedSquare = null;
premove = null;
    history = [];
moveHistory = [];
redoHistory = [];
lastMove = null;
capturedWhite = [];
capturedBlack = [];
moveAnalysis = [];
analysisEvaluation = 0;
pendingMoveAnalysis = null;
analysisThinking = false;
evaluationBeforeMove = 0;
lastMoveEvaluation = 0;
    castlingRights = {
        wK: true,
        wQ: true,
        bK: true,
        bQ: true
    };

    enPassantSquare = null;
resetClocks();
startClock();

    createBoard();
updateMoveHistory();
updateCapturedPieces();
    updateGameStatus();

    if (currentTurn !== playerColor) {
        computerMove();
    }
}

// ===============================
// الحركة بالنقر
// ===============================
function clickMove(index) {

    if (gameOver) {
        return;
    }

    // ===============================
    // Premove أثناء تفكير الكمبيوتر
    // ===============================

    if (currentTurn !== playerColor) {

        // اختيار قطعة اللاعب
        if (selectedSquare === null) {

            if (
                pieces[index] &&
                getColor(pieces[index]) === playerColor
            ) {

                selectedSquare = index;

                createBoard();

                document
                    .querySelectorAll(".square")[index]
                    .classList.add("selected");
            }

            return;
        }

        // إلغاء الاختيار بالضغط على نفس المربع
        if (selectedSquare === index) {

            selectedSquare = null;

            createBoard();

            return;
        }

        // حفظ الـ Premove
        if (
            pieces[selectedSquare] &&
            getColor(pieces[selectedSquare]) === playerColor
        ) {

            premove = {
                from: selectedSquare,
                to: index
            };

            console.log(
                "Premove:",
                selectedSquare,
                "→",
                index
            );
        }

        selectedSquare = null;

        createBoard();

        return;
    }

    // ===============================
    // الحركة العادية
    // ===============================

    if (selectedSquare === null) {

        if (
            pieces[index] &&
            getColor(pieces[index]) === currentTurn
        ) {

            selectedSquare = index;

            createBoard();

            document
                .querySelectorAll(".square")[index]
                .classList.add("selected");
        }

        return;
    }

    // الضغط على نفس المربع
    if (selectedSquare === index) {

        selectedSquare = null;

        createBoard();

        return;
    }

    // محاولة الحركة
    if (makeMove(selectedSquare, index)) {
        return;
    }

    // اختيار قطعة أخرى من نفس اللون
    if (
        pieces[index] &&
        getColor(pieces[index]) === currentTurn
    ) {

        selectedSquare = index;

        createBoard();

        document
            .querySelectorAll(".square")[index]
            .classList.add("selected");
    }
}

// ===============================
// إنشاء الرقعة
// ===============================
function createBoard() {
    board.innerHTML = "";

    if (playerColor === "b") {
        board.classList.add("flipped");
    } else {
        board.classList.remove("flipped");
    }

    for (let i = 0; i < 64; i++) {

        const square = document.createElement("div");
        square.classList.add("square");
const row = Math.floor(i / 8);
const col = i % 8;

if (col === 0) {
    const rank = document.createElement("span");
    rank.classList.add("coordinates", "rank-coordinate");
    rank.textContent = playerColor === "w"
        ? 8 - row
        : row + 1;
    square.appendChild(rank);
}

if (row === 7) {
    const file = document.createElement("span");
    file.classList.add("coordinates", "file-coordinate");
    file.textContent = playerColor === "w"
        ? String.fromCharCode(97 + col)
        : String.fromCharCode(104 - col);
    square.appendChild(file);
}
        // ألوان الرقعة
        if (Math.floor(i / 8) % 2 === i % 2) {
            square.classList.add("light");
        } else {
            square.classList.add("dark");
        }

        // المربع المختار
        if (selectedSquare === i) {
            square.classList.add("selected");
        }
if (
    selectedSquare !== null &&
    isLegalMove(selectedSquare, i)
) {
    square.classList.add("legal-move");
}
        // تمييز الملك عند Check
        if (
            pieces[i] &&
            getType(pieces[i]) === "K" &&
            isInCheck(getColor(pieces[i]))
        ) {
            square.classList.add("check");
        }

        // آخر نقلة
        if (
            lastMove &&
            (lastMove.from === i || lastMove.to === i)
        ) {
            square.classList.add("last-move");
        }

const piece = pieces[i];

if (piece) {

    const image = document.createElement("img");

    image.src = "pieces/" + piece + ".svg";
    image.classList.add("chess-piece");

    // السماح بسحب قطعة اللاعب فقط
    // السماح بسحب قطعة اللاعب فقط
if (getColor(piece) === playerColor) {

    let startX = 0;
    let startY = 0;
    let hasDragged = false;
    let dragPiece = null;

    square.addEventListener("mousedown", function (event) {

        if (gameOver) return;
        if (event.button !== 0) return;
        if (!pieces[i]) return;
        if (getColor(pieces[i]) !== playerColor) return;

        startX = event.clientX;
        startY = event.clientY;
        hasDragged = false;
        dragPiece = null;

        draggedSquare = i;

        function movePiece(e) {

            const distance = Math.sqrt(
                Math.pow(e.clientX - startX, 2) +
                Math.pow(e.clientY - startY, 2)
            );

            // ما زالت نقرة عادية
            if (!hasDragged) {

                if (distance <= 5) {
                    return;
                }

                // بدأ السحب فعلياً
                hasDragged = true;

                image.style.visibility = "hidden";

                dragPiece = document.createElement("img");

                dragPiece.src = piece + ".svg";
                dragPiece.classList.add("dragging-piece");

                document.body.appendChild(dragPiece);
            }

            if (dragPiece) {

                dragPiece.style.left =
                    e.clientX + "px";

                dragPiece.style.top =
                    e.clientY + "px";
            }
        }

        function releasePiece(e) {

            document.removeEventListener(
                "mousemove",
                movePiece
            );

            document.removeEventListener(
                "mouseup",
                releasePiece
            );

            // =================================
            // نقرة عادية
            // =================================

            if (!hasDragged) {

                draggedSquare = null;

                // لا نحرك القطعة هنا.
                // click event سيتولى الأمر.
                return;
            }

            // =================================
            // سحب فعلي
            // =================================

            if (dragPiece) {

                dragPiece.remove();
                dragPiece = null;
            }

            image.style.visibility = "visible";

            const element =
                document.elementFromPoint(
                    e.clientX,
                    e.clientY
                );

            const targetSquare =
                element
                    ? element.closest(".square")
                    : null;

            if (!targetSquare) {

                draggedSquare = null;
                selectedSquare = null;

                createBoard();

                return;
            }

            const allSquares =
                Array.from(
                    document.querySelectorAll(".square")
                );

            const to =
                allSquares.indexOf(targetSquare);

            if (to < 0) {

                draggedSquare = null;
                selectedSquare = null;

                createBoard();

                return;
            }

            // =================================
            // Premove
            // =================================

            if (currentTurn !== playerColor) {

                premove = {
                    from: i,
                    to: to
                };

                draggedSquare = null;
                selectedSquare = null;

                createBoard();

                return;
            }

            // =================================
            // تنفيذ الحركة
            // =================================

            makeMove(i, to);

            draggedSquare = null;

            createBoard();
        }

        document.addEventListener(
            "mousemove",
            movePiece
        );

        document.addEventListener(
            "mouseup",
            releasePiece
        );
    });
}


    square.appendChild(image);
    square.addEventListener("click", function () {
    clickMove(i);
});
}

    board.appendChild(square);
    
    }

    updateEvaluationBar();
    updateBoardColors();
    updateGameStatus();
}

// ===============================
// شريط التقييم
// ===============================

function calculateMaterial() {

    const values = {
        P: 1,
        N: 3,
        B: 3,
        R: 5,
        Q: 9,
        K: 0
    };

    let score = 0;

    for (const piece of pieces) {

        if (!piece) {
            continue;
        }

        const value =
            values[getType(piece)];

        if (getColor(piece) === "w") {
            score += value;
        } else {
            score -= value;
        }
    }

    return score;
}
function updateEvaluationBar() {

    const bar =
        document.getElementById("evaluationBar");

    if (!bar) {
        return;
    }

    // التقييم بالفعل من منظور الأبيض
    let score = stockfishEvaluation;

    // تحديد التقييم بين -10 و +10
    const limited =
        Math.max(-10, Math.min(10, score));

    const whitePercent =
        50 + limited * 5;

    bar.style.setProperty(
        "--white-percent",
        whitePercent + "%"
    );

    const number =
        document.getElementById("evaluationNumber");

    if (number) {

        if (score > 0) {
            number.textContent =
                "+" + score.toFixed(1);
        } else {
            number.textContent =
                score.toFixed(1);
        }
    }
}

// ===============================
// أزرار New Game و Undo
// ===============================

function createControls() {

    let controls =
        document.getElementById(
            "chessControls"
        );

    if (controls) {
        return;
    }

    controls =
        document.createElement("div");

    controls.id =
        "chessControls";

    controls.innerHTML = `
        <button id="newGameButton">
            🔄 New Game
        </button>

        <button id="undoButton">
    ↩ Undo
</button>

<button id="redoButton">
    ↪ Redo
</button>

        <button id="resignButton">
            🏳 Resign
        </button>

        <label id="computerRatingLabel">
            Computer:
            <select id="computerRating">
                <option value="1500">1500</option>
                <option value="1600">1600</option>
                <option value="1700">1700</option>
                <option value="1800">1800</option>
                <option value="1900">1900</option>
                <option value="2000" selected>2000</option>
                <option value="2100">2100</option>
                <option value="2200">2200</option>
                <option value="2300">2300</option>
                <option value="2400">2400</option>
            </select>
        </label>
    `;

    const gameArea =
    document.getElementById("chessGameArea");

gameArea.parentNode.insertBefore(
    controls,
    gameArea.nextSibling
);

    document
        .getElementById("newGameButton")
        .addEventListener(
            "click",
            newGame
        );

    document
        .getElementById("undoButton")
        .addEventListener(
            "click",
            undoMove
        );
document
    .getElementById("redoButton")
    .addEventListener(
        "click",
        redoMove
    );

    document
        .getElementById("resignButton")
        .addEventListener(
            "click",
            resignGame
        );

    document
        .getElementById("computerRating")
        .addEventListener(
            "change",
            function () {

                computerRating =
                    parseInt(this.value);

            }
        );
}

// ===============================
// إنشاء شريط التقييم
// ===============================

function createEvaluationBar() {

    const gameArea =
        document.getElementById("chessGameArea");

    if (!gameArea) {
        return;
    }

    const wrapper =
        document.createElement("div");

    wrapper.id =
        "evaluationWrapper";

    wrapper.innerHTML = `
        <div id="evaluationBar">
            <div id="evaluationNumber">
                0.0
            </div>
        </div>
    `;

    gameArea.insertBefore(
        wrapper,
        board
    );
}

// ===============================
// تشغيل اللعبة
// ===============================

createControls();

createEvaluationBar();

createBoard();
updateCapturedPieces();

resetClocks();
startClock();

document
    .getElementById("whiteButton")
    .addEventListener("click", function () {
        playerColor = "w";
        newGame();
    });

document
    .getElementById("blackButton")
    .addEventListener("click", function () {
        playerColor = "b";
        newGame();
    });

document
    .getElementById("randomButton")
    .addEventListener("click", function () {
        playerColor = Math.random() < 0.5 ? "w" : "b";
        newGame();
    });


// ===============================
// تحديث اللعبة عند التشغيل
// ===============================

updateGameStatus();
function algebraicToIndex(square) {

    const file = square.charCodeAt(0) - 97;

    const rank = parseInt(square[1], 10);

    const row = 8 - rank;

    return row * 8 + file;
}
function getFEN() {

    let fen = "";

    for (let row = 0; row < 8; row++) {

        let empty = 0;

        for (let col = 0; col < 8; col++) {

            const piece = pieces[row * 8 + col];

            if (!piece) {
                empty++;
            } else {

                if (empty > 0) {
                    fen += empty;
                    empty = 0;
                }

                const symbols = {
                    wP: "P",
                    wN: "N",
                    wB: "B",
                    wR: "R",
                    wQ: "Q",
                    wK: "K",
                    bP: "p",
                    bN: "n",
                    bB: "b",
                    bR: "r",
                    bQ: "q",
                    bK: "k"
                };

                fen += symbols[piece];
            }
        }

        if (empty > 0) {
            fen += empty;
        }

        if (row < 7) {
            fen += "/";
        }
    }

    fen += " ";
    fen += currentTurn === "w" ? "w" : "b";
    fen += " ";

    let castling = "";

    if (castlingRights.wK) castling += "K";
    if (castlingRights.wQ) castling += "Q";
    if (castlingRights.bK) castling += "k";
    if (castlingRights.bQ) castling += "q";

    fen += castling || "-";

    fen += " ";

    if (enPassantSquare !== null) {

        const row = Math.floor(enPassantSquare / 8);
        const col = enPassantSquare % 8;

        fen +=
            String.fromCharCode(97 + col) +
            (8 - row);

    } else {
        fen += "-";
    }

    fen += " 0 1";

    return fen;
}
// ===============================
// الكمبيوتر
// ===============================
function computerMove() {

    if (gameOver) return;

    if (currentTurn === playerColor) return;

    if (stockfishThinking) return;

    if (!stockfishReady) {
        console.log("Stockfish is not ready yet.");
        return;
    }

    stockfishThinking = true;

    // رقم جديد لهذا الطلب
    engineRequestId++;
currentEngineRequest = engineRequestId;

const requestId = currentEngineRequest;
engineRequestSession = gameSessionId;

    const fen = getFEN();

    console.log("Stockfish thinking...");
    console.log("Request:", requestId);
    console.log("FEN:", fen);

    // إعداد القوة الأساسية
    stockfish.postMessage("setoption name UCI_LimitStrength value true");

stockfish.postMessage(
    "setoption name UCI_Elo value " + computerRating
);

    stockfish.postMessage("position fen " + fen);

    // وقت التفكير حسب مستوى الكمبيوتر
    let thinkTime = 100;

    stockfish.postMessage(
        "go movetime " + thinkTime
    );
}

// ===============================
// ساعة الشطرنج
// ===============================

function formatTime(seconds) {

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(remainingSeconds).padStart(2, "0")
    );
}
function updateClocks() {
    const whiteClock = document.getElementById("whiteClock");
    const blackClock = document.getElementById("blackClock");

    if (!whiteClock || !blackClock) return;

    whiteClock.textContent = formatTime(whiteTime);
    blackClock.textContent = formatTime(blackTime);

    whiteClock.classList.remove("active", "low-time", "critical-time");
    blackClock.classList.remove("active", "low-time", "critical-time");

    if (!gameOver && currentTurn === "w") {
        whiteClock.classList.add("active");
    }

    if (!gameOver && currentTurn === "b") {
        blackClock.classList.add("active");
    }

    if (whiteTime <= 60 && whiteTime > 10) {
        whiteClock.classList.add("low-time");
    }

    if (blackTime <= 60 && blackTime > 10) {
        blackClock.classList.add("low-time");
    }

    if (whiteTime <= 10 && whiteTime > 0) {
        whiteClock.classList.add("critical-time");
    }

    if (blackTime <= 10 && blackTime > 0) {
        blackClock.classList.add("critical-time");
    }
}
function startClock() {

    if (clockInterval) {
        clearInterval(clockInterval);
    }

    clockInterval = setInterval(function () {

        if (gameOver || currentTurn === null) {
            clearInterval(clockInterval);
            clockInterval = null;
            return;
        }

        if (currentTurn === "w") {

            whiteTime--;

            if (whiteTime <= 0) {

                whiteTime = 0;
                gameOver = true;

                clearInterval(clockInterval);
                clockInterval = null;

                document.getElementById("gameStatus").textContent =
                    "Time out — Black wins!";

            }

        } else {

            blackTime--;

            if (blackTime <= 0) {

                blackTime = 0;
                gameOver = true;

                clearInterval(clockInterval);
                clockInterval = null;

                document.getElementById("gameStatus").textContent =
                    "Time out — White wins!";
            }
        }

        updateClocks();

    }, 1000);
}

function resetClocks() {
    whiteTime = selectedTime;
    blackTime = selectedTime;
    updateClocks();
}
const timeSelect = document.getElementById("timeSelect");

if (timeSelect) {
    timeSelect.addEventListener("change", function () {

        const values = this.value.split(",");

        selectedTime = Number(values[0]);
        incrementTime = Number(values[1]);

        newGame();
    });
}
const timeCategoryButtons = document.querySelectorAll(".time-category button");

timeCategoryButtons.forEach(function(button) {

    button.addEventListener("click", function() {

        const category = this.dataset.category;

        timeCategoryButtons.forEach(function(btn) {
            btn.classList.remove("active");
        });

        this.classList.add("active");

        if (category === "bullet") {
            timeSelect.value = "60,0";
        }

        if (category === "blitz") {
            timeSelect.value = "180,2";
        }

        if (category === "rapid") {
    timeSelect.value = "600,0";
}

        if (category === "classical") {
            timeSelect.value = "1800,0";
        }

        const values = timeSelect.value.split(",");

        selectedTime = Number(values[0]);
        incrementTime = Number(values[1]);

        newGame();
    });

});
timeCategoryButtons.forEach(function(button) {
    button.classList.remove("active");
});

document
    .querySelector('[data-category="rapid"]')
    .classList.add("active");
 function updateMoveHistoryAnalysis() {

    const rows =
        document.querySelectorAll(".move-row");

    for (let i = 0; i < rows.length; i++) {

        const whiteAnalysis =
            moveAnalysis[i * 2];

        const blackAnalysis =
            moveAnalysis[i * 2 + 1];

        const whiteMove =
            rows[i].querySelector(".white-move");

        const blackMove =
            rows[i].querySelector(".black-move");

        if (whiteMove && whiteAnalysis) {

            let label =
                whiteMove.querySelector(".move-analysis");

            if (!label) {

                label =
                    document.createElement("span");

                label.className =
                    "move-analysis";

                whiteMove.appendChild(label);
            }

            label.textContent =
                whiteAnalysis.classification;
        }

        if (blackMove && blackAnalysis) {

            let label =
                blackMove.querySelector(".move-analysis");

            if (!label) {

                label =
                    document.createElement("span");

                label.className =
                    "move-analysis";

                blackMove.appendChild(label);
            }

            label.textContent =
                blackAnalysis.classification;
        }
    }
}
function flipBoard() {
    playerColor = playerColor === "w" ? "b" : "w";
    createBoard();
}
function updateGameStatus() {

    const status = document.getElementById("gameStatus");

    if (!status) return;

    if (gameOver) {
        status.textContent = "Game Over";
        return;
    }
status.classList.remove("check");
    if (isInCheck(currentTurn)) {
        status.classList.add("check");
        status.textContent =
            currentTurn === "w"
                ? "♔ White is in Check!"
                : "♚ Black is in Check!";
    } else {
        status.textContent =
            currentTurn === "w"
                ? "White to move"
                : "Black to move";
    }
}
function updateCapturedPieces() {

    const whiteContainer =
        document.getElementById("capturedWhite");

    const blackContainer =
        document.getElementById("capturedBlack");

    if (!whiteContainer || !blackContainer) {
        return;
    }

    whiteContainer.innerHTML = "";
    blackContainer.innerHTML = "";

    // قيمة القطع
    const pieceValues = {
        P: 1,
        N: 3,
        B: 3,
        R: 5,
        Q: 9
    };

    // ترتيب العرض: بيدق → حصان/فيل → رخ → وزير
    const pieceOrder = ["P", "N", "B", "R", "Q"];

    function sortCaptured(list) {

        return [...list].sort(function(a, b) {

            const valueA = pieceOrder.indexOf(getType(a));
            const valueB = pieceOrder.indexOf(getType(b));

            return valueA - valueB;
        });
    }

    function calculateCapturedValue(list) {

        let total = 0;

        list.forEach(function(piece) {

            const type = getType(piece);

            if (pieceValues[type]) {
                total += pieceValues[type];
            }
        });

        return total;
    }

    // ترتيب القطع
    const sortedWhite =
        sortCaptured(capturedWhite);

    const sortedBlack =
        sortCaptured(capturedBlack);

    // عرض القطع البيضاء المأخوذة
    sortedWhite.forEach(function(piece) {

        const image =
            document.createElement("img");

        image.src = "pieces/" + piece + ".svg";
        image.alt = piece;

        whiteContainer.appendChild(image);
    });

    // عرض القطع السوداء المأخوذة
    sortedBlack.forEach(function(piece) {

        const image =
            document.createElement("img");

        image.src = "pieces/" + piece + ".svg";
        image.alt = piece;

        blackContainer.appendChild(image);
    });

    // حساب فرق المادة
    const whiteValue =
        calculateCapturedValue(capturedWhite);

    const blackValue =
        calculateCapturedValue(capturedBlack);

    const difference =
        blackValue - whiteValue;

    // حذف نتيجة قديمة
    const oldScore =
        document.getElementById("materialScore");

    if (oldScore) {
        oldScore.remove();
    }

    // لا نعرض شيئاً إذا كانت المادة متساوية
    if (difference === 0) {
        return;
    }

    const score =
        document.createElement("span");

    score.id = "materialScore";

    score.textContent =
        "+" + Math.abs(difference);

    // الطرف الذي يملك المادة الإضافية
    if (difference > 0) {
        blackContainer.appendChild(score);
    } else {
        whiteContainer.appendChild(score);
    }
}