export async function sleep(delay = 0) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}
