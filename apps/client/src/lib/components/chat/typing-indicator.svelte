<span class="assistant-loader" aria-label="Assistant is typing">
  <span class="typing-dot"></span>
  <span class="typing-dot"></span>
  <span class="typing-dot"></span>
</span>

<style>
  .assistant-loader {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding-block: 0.35rem;
  }

  .typing-dot {
    display: block;
    width: 0.4rem;
    height: 0.4rem;
    flex: 0 0 auto;
    border-radius: 9999px;
    background: rgb(113 113 122);
    animation: typing-bounce 1.1s infinite ease-in-out;
  }

  .typing-dot:nth-child(2) {
    animation-delay: 0.15s;
  }

  .typing-dot:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes typing-bounce {
    0%, 80%, 100% {
      transform: translateY(0);
      opacity: 0.45;
    }

    40% {
      transform: translateY(-0.22rem);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .typing-dot {
      animation: none;
      opacity: 0.75;
    }
  }
</style>
